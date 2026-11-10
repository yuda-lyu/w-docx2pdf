import fs from 'fs'
import http from 'http'


//測試用docx夾具產生器(不依賴第三方壓縮套件: 自寫「僅儲存」之zip), 供Word實例隔離測試產生可辨識內容之docx
//  genDocx({ title, pages, linkUrl, templateUrl }): title為第一頁標題文字, pages為頁數(以分頁符分隔, 各頁有可辨識之文字), linkUrl給定時於第一頁嵌入一張指向該網址之連結圖, templateUrl給定時附加範本指向該網址
//  連結圖: Word開啟後(Open)即向網址取圖, 匯出PDF(SaveAs)期間若伺服器扣住則卡在匯出中(實測), 即為「轉檔進行中」之確定時點; 此時Word不受理他行程之COM呼叫(實測)
//  附加範本: Word開啟(Open)期間向網址取範本, 伺服器扣住期間Open不返回, 但Word受理他行程之COM呼叫(實測), 供「他行程連上轉檔器之Word」之確定時點
//  前提: docx僅含最小部件(Content_Types, 關聯, document.xml), Word 2016以後可開啟


let tableCrc = (() => {
    let t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
        }
        t[n] = c >>> 0
    }
    return t
})()


function crc32(buf) {
    let c = 0xFFFFFFFF
    for (let i = 0; i < buf.length; i++) {
        c = tableCrc[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
    }
    return (c ^ 0xFFFFFFFF) >>> 0
}


//zipStore, 以「儲存」方式(不壓縮)打包, files為[{ name, data(Buffer) }]
function zipStore(files) {
    let parts = []
    let cds = []
    let offset = 0
    for (let f of files) {
        let name = Buffer.from(f.name, 'utf8')
        let data = f.data
        let crc = crc32(data)

        //local file header
        let lh = Buffer.alloc(30)
        lh.writeUInt32LE(0x04034b50, 0)
        lh.writeUInt16LE(20, 4) //version needed
        lh.writeUInt16LE(0x0800, 6) //flags: utf-8檔名
        lh.writeUInt16LE(0, 8) //method: store
        lh.writeUInt16LE(0, 10) //time
        lh.writeUInt16LE(0x21, 12) //date: 1980-01-01
        lh.writeUInt32LE(crc, 14)
        lh.writeUInt32LE(data.length, 18)
        lh.writeUInt32LE(data.length, 22)
        lh.writeUInt16LE(name.length, 26)
        lh.writeUInt16LE(0, 28)
        parts.push(lh, name, data)

        //central directory header
        let ch = Buffer.alloc(46)
        ch.writeUInt32LE(0x02014b50, 0)
        ch.writeUInt16LE(20, 4) //version made by
        ch.writeUInt16LE(20, 6) //version needed
        ch.writeUInt16LE(0x0800, 8)
        ch.writeUInt16LE(0, 10)
        ch.writeUInt16LE(0, 12)
        ch.writeUInt16LE(0x21, 14)
        ch.writeUInt32LE(crc, 16)
        ch.writeUInt32LE(data.length, 20)
        ch.writeUInt32LE(data.length, 24)
        ch.writeUInt16LE(name.length, 28)
        ch.writeUInt32LE(offset, 42)
        cds.push(ch, name)

        offset += lh.length + name.length + data.length
    }
    let cd = Buffer.concat(cds)
    let end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(files.length, 8)
    end.writeUInt16LE(files.length, 10)
    end.writeUInt32LE(cd.length, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...parts, cd, end])
}


function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}


function genDocx({ title = 'docx', pages = 1, linkUrl = '', templateUrl = '' } = {}) {
    let ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
    let picture = `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Picture 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="hold.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:link="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    let body = []
    for (let i = 1; i <= pages; i++) {
        if (i > 1) {
            body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        }
        body.push(`<w:p><w:r><w:t>${esc(i === 1 ? title : `${title} page ${i}`)}</w:t></w:r></w:p>`)
        if (i === 1 && linkUrl !== '') {
            body.push(picture)
        }
    }
    let document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body.join('')}<w:sectPr/></w:body></w:document>`
    let hasSettings = templateUrl !== ''
    let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${hasSettings ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' : ''}</Types>`
    let rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    let files = [
        { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
        { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
        { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
    ]
    if (linkUrl !== '' || hasSettings) {
        let rs = []
        if (linkUrl !== '') {
            rs.push(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${esc(linkUrl)}" TargetMode="External"/>`)
        }
        if (hasSettings) {
            rs.push('<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>')
        }
        let drels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rs.join('')}</Relationships>`
        files.push({ name: 'word/_rels/document.xml.rels', data: Buffer.from(drels, 'utf8') })
    }
    if (hasSettings) {
        //附加範本(attachedTemplate)指向網址: Word開啟(Open)時即向該網址取範本, 伺服器扣住期間Open不返回, 但Word仍受理他行程之COM呼叫(實測); 連結圖之扣住則使匯出PDF(SaveAs)期間不受理(實測)
        let settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${ns}><w:attachedTemplate r:id="rId1"/></w:settings>`
        let srels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="${esc(templateUrl)}" TargetMode="External"/></Relationships>`
        files.push({ name: 'word/settings.xml', data: Buffer.from(settings, 'utf8') })
        files.push({ name: 'word/_rels/settings.xml.rels', data: Buffer.from(srels, 'utf8') })
    }
    return zipStore(files)
}


function writeDocx(fp, opt) {
    fs.writeFileSync(fp, genDocx(opt))
    return fp
}


//startGetHoldServer, 本機http伺服器(127.0.0.1, 作業系統配發埠), 供附加範本(templateUrl)之扣住點: 只扣住第一個GET請求直到release(), 其餘請求(Word先發之OPTIONS與HEAD等)立即回404
//  why: Word向附加範本網址取範本時先發OPTIONS、HEAD再發GET; HEAD被扣住期間Word不受理他行程之COM呼叫, 只有GET被扣住時才受理(實測), 故不可用扣住全部請求之伺服器(如wordInstance.mjs之startHoldServer)
//  firstRequest()於GET到達時resolve; log為各請求之「方法 路徑」
async function startGetHoldServer() {
    let released = false
    let held = false
    let waiters = []
    let log = []
    let onFirst = null
    let first = new Promise((resolve) => {
        onFirst = resolve
    })
    let server = http.createServer(async (req, res) => {
        log.push(`${req.method} ${req.url}`)
        if (req.method === 'GET' && !held) {
            held = true
            onFirst()
            if (!released) {
                await new Promise((resolve) => waiters.push(resolve))
            }
        }
        res.writeHead(404)
        res.end()
    })
    await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
    })
    let url = `http://127.0.0.1:${server.address().port}/template.dotx`
    let release = () => {
        released = true
        for (let r of waiters.splice(0)) {
            r()
        }
    }
    let close = async () => {
        release()
        server.closeAllConnections()
        await new Promise((resolve) => server.close(resolve))
    }
    return { url, log, firstRequest: () => first, release, close }
}


export { genDocx, writeDocx, startGetHoldServer }
