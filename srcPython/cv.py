from win32com import client as wc
import sys

def getError():
    import sys

    #exc_info
    type, message, traceback = sys.exc_info()

    #es
    es=[]
    while traceback:
        e={
            'name':traceback.tb_frame.f_code.co_name,
            'filename':traceback.tb_frame.f_code.co_filename,
        }
        es.append(e)
        traceback = traceback.tb_next

    #err
    err={
        'type':type,
        'message':str(message),
        'traceback':es,
    }

    return err


def j2o(v):
    #json轉物件
    import json
    return json.loads(v)


def o2j(v):
    #物件轉json
    import json
    return json.dumps(v, ensure_ascii=False)


def str2b64(v):
    #字串轉base64字串
    import base64
    v=base64.b64encode(v.encode('utf-8'))
    return str(v,'utf-8')
    

def b642str(v):
    #base64字串轉字串
    import base64
    return base64.b64decode(v).decode('utf-8')


def readText(fn):
    #讀取檔案fn內文字
    import codecs
    with codecs.open(fn,'r',encoding='utf8') as f:
        return f.read()

    
def writeText(fn,str):
    #寫出文字str至檔案fn
    import codecs
    with codecs.open(fn,'w',encoding='utf8') as f:
        f.write(str)


def resolvePaths(fpIn, fpOut):
    #解析輸入輸出路徑, 規則同第三方docx2pdf 0.1.8之單檔模式(本轉檔器不再依賴該套件):
    #  輸入須為.docx檔; 輸出為資料夾時存為<輸入檔名>.pdf, 否則須為.pdf; 輸出為空時存於輸入檔旁
    #  不含該套件之資料夾批次轉檔(本套件呼叫端恆給單一檔案)
    from pathlib import Path

    pIn = Path(fpIn).resolve()
    if pIn.is_dir():
        raise ValueError('fpIn is a folder, only a single docx file is supported')
    assert str(pIn).endswith('.docx')

    if fpOut:
        pOut = Path(fpOut).resolve()
        if pOut.is_dir():
            pOut = pOut / (str(pIn.stem) + '.pdf')
        else:
            assert str(pOut).endswith('.pdf')
    else:
        pOut = pIn.parent / (str(pIn.stem) + '.pdf')

    return str(pIn), str(pOut)


def countOtherDocs(app, docsLeft):
    #實例內非本行程之文件數, 含受保護檢視之視窗(其不在Documents內); docsLeft為本行程關閉失敗而仍開著者, 以COM物件身分比對(不以路徑: 他人可能重開同一路徑)
    #回傳(數量, 狀態): 狀態'ok'為已判定, 'gone'為實例已不存在(如已被他人Quit), 'unknown'為無法判定(忙碌或讀取失敗)
    import time
    import pythoncom

    #實例已不存在之錯誤: RPC_S_SERVER_UNAVAILABLE, RPC_S_CALL_FAILED, RPC_E_DISCONNECTED
    hrsGone = (-2147023174, -2147023170, -2147417848)

    for i in range(10):
        try:
            try:
                n = app.ProtectedViewWindows.Count
            except AttributeError:
                n = 0 #無此集合之Word版本
            for d in app.Documents:
                if not any(d == o for o in docsLeft):
                    n += 1
            return n, 'ok'
        except pythoncom.com_error as e:
            if getattr(e, 'hresult', None) in hrsGone:
                return 0, 'gone'
        except:
            pass
        time.sleep(0.5) #他人呼叫中(忙碌)等暫時失敗, 稍候重試
    return None, 'unknown'


def closeOwnWord(app, docs):
    #關閉本行程開啟之文件, 再結束本行程所開之Word實例; 實例內另有他人之文件或無法判定時不結束
    #why: DispatchEx所開之實例仍登錄於ROT, 他行程以Dispatch(先GetActiveObject)可連上並於其中開文件(實測), 此時Quit會關掉對方之文件且不儲存;
    #  連上者(舊寫法)用畢自會Quit, 故保留實例; 無法判定時亦保留(寧可留下實例, 不關他人之文件); 盤點與Quit之間他人仍可連入, 此窗口無法消除

    #Close, 關閉失敗者仍屬本行程
    WdDoNotSaveChanges = 0 #wdDoNotSaveChanges
    docsLeft = []
    for doc in reversed(docs):
        try:
            doc.Close(WdDoNotSaveChanges)
        except:
            docsLeft.append(doc)

    #nOther
    nOther, st = countOtherDocs(app, docsLeft)
    if st == 'gone':
        return
    if st != 'ok' or nOther > 0:
        print('Word instance is kept since ' + (f'{nOther} document(s) opened by another client' if st == 'ok' else 'its documents can not be checked'), file=sys.stderr)
        return

    #Quit
    WdSaveOptions = 0 #wdDoNotSaveChanges=0(不儲存擱置中變更) #https://learn.microsoft.com/zh-tw/office/vba/api/word.wdsaveoptions
    try:
        app.Quit(WdSaveOptions)
    except:
        pass


def docxToPdf(fpIn, fpOut):
    #docx轉pdf, 以Word COM自行轉檔, 轉出方式同第三方docx2pdf 0.1.8(Documents.Open後SaveAs, FileFormat=wdFormatPDF=17)
    fpIn, fpOut = resolvePaths(fpIn, fpOut)

    #DispatchEx, 每次另開獨立之Word實例(CoCreateInstanceEx, 實測已有其他Word時亦另起WINWORD)
    #why: 第三方docx2pdf用Dispatch, 其會先以GetActiveObject連上已在執行之Word(他行程之轉檔或使用者開啟者), 轉完Quit即關掉對方之文件, 兩邊同時轉檔則互相失敗
    app = wc.DispatchEx('Word.Application')

    #docs, 本行程開啟之文件
    docs = []

    #任一步驟(含下列設定)例外時亦須關閉已開啟之文件並結束本行程所開之Word, 否則殘留之WINWORD會使後續轉檔受影響
    try:

        #正式版須隱藏
        app.Visible = False

        #不詢問使用者
        app.DisplayAlerts = False

        #Open, 以唯讀開啟(Open之參數依序為FileName, ConfirmConversions, ReadOnly): 本轉檔器只SaveAs至pdf, 不存回輸入檔
        #  輸出為.pdf而輸入為.docx, 兩者不可能同路徑(resolvePaths已驗副檔名), 故無須如其他轉檔器之「輸出即輸入須可寫」例外
        doc = app.Documents.Open(fpIn, False, True)
        docs.append(doc)

        #SaveAs
        WdFormatPDF = 17 #wdFormatPDF=17 #https://learn.microsoft.com/zh-tw/office/vba/api/word.wdsaveformat
        doc.SaveAs(fpOut, FileFormat=WdFormatPDF)

    finally:
        closeOwnWord(app, docs)


def cv(fpIn, fpOut, opt):
    out = ''

    try:
        docxToPdf(fpIn, fpOut)
        out = 'ok'
    except:
        err=getError()
        print(err)
        
    return out


def shellCv(fpIn, fpOut, opt):
    
    #cv
    cv(fpIn, fpOut ,opt)
    

def core(b64):
    state=''

    try:

        #b642str
        s=b642str(b64)
        # print(s)

        #j2o
        o=j2o(s)
        print(o)

        #params
        fpIn=o['fpIn']
        fpOut=o['fpOut']
        opt=o['opt']

        #shellCv
        shellCv(fpIn, fpOut, opt)

        state='success'
    except:
        err=getError()
        state='error: '+str(err["message"])

    return state


def run():
    import sys

    #由外部程序呼叫或直接給予檔案路徑
    state=''
    argv=sys.argv
    #argv=['','']
    if len(argv)==2:
        
        #b64
        b64=sys.argv[1]
        
        #core
        state=core(b64)
        
    else:
        #print(sys.argv)
        state='error: invalid length of argv'
    
    #print & flush
    print(state)
    sys.stdout.flush()


if True:
    #正式版
    
    #run
    run()
    
    
if False:
    #產生測試輸入b64
    
    #inp
    inp={
        'fpIn':'ztmp.docx',
        'fpOut':'ztmp.pdf',
        'opt': {},
    }
    # print(o2j(inp))
    
    #str2b64
    b64=str2b64(o2j(inp))
    print(b64)

    #core
    state=core(b64)

    print(state)

