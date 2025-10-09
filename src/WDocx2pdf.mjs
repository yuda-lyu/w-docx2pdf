import path from 'path'
import process from 'process'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import genID from 'wsemi/src/genID.mjs'
import now2strp from 'wsemi/src/now2strp.mjs'
import str2b64 from 'wsemi/src/str2b64.mjs'
import execProcess from 'wsemi/src/execProcess.mjs'
import fsIsFile from 'wsemi/src/fsIsFile.mjs'
import fsIsFolder from 'wsemi/src/fsIsFolder.mjs'
import fsCopyFile from 'wsemi/src/fsCopyFile.mjs'
import fsDeleteFile from 'wsemi/src/fsDeleteFile.mjs'
import fsCreateFolder from 'wsemi/src/fsCreateFolder.mjs'


let fdSrv = path.resolve()


function isWindows() {
    return process.platform === 'win32'
}


/**
 * docx2pdf docx檔轉pdf檔
 *
 * @param {String} fpIn 輸入來源docx檔位置字串
 * @param {String} fpOut 輸入轉出pdf檔位置字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} [opt.fdTemp='./_convertTempPdf'] 輸入臨時檔位置字串，預設'./_convertTempPdf'
 * @param {String} [opt.mode='MicrosoftOffice'] 輸入執行模式字串，可使用'MicrosoftOffice'與'LibreOffice'，若要使用皆須安裝軟體，預設'MicrosoftOffice'
 * @param {String} [opt.fpExeLibreOffice='C:\\Program Files\\LibreOffice\\program\\soffice.exe'] 輸入若mode='LibreOffice'，須提供LibreOffice執行檔soffice.exe位置字串，預設'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
 * @returns {Promise} 回傳Promise，resolve回傳成功訊息，reject回傳錯誤訊息
 * @example
 *
 * import WDocx2pdf from './src/WDocx2pdf.mjs'
 * //import WDocx2pdf from 'w-docx2pdf/src/WDocx2pdf.mjs'
 * //import WDocx2pdf from 'w-docx2pdf'
 *
 * async function test() {
 *
 *     let fpIn = `./test/ztmp.docx`
 *     let fpOut = `./test/ztmp.pdf`
 *     let opt = {}
 *
 *     let r = await WDocx2pdf(fpIn, fpOut, opt)
 *     console.log(r)
 *     // => ok
 *
 *     w.fsDeleteFile(fpOut)
 *
 * }
 * test()
 *     .catch((err) => {
 *         console.log('catch', err)
 *     })
 *
 */
async function WDocx2pdf(fpIn, fpOut, opt = {}) {
    let errTemp = null

    //isWindows
    if (!isWindows()) {
        return Promise.reject('operating system is not windows')
    }

    //check
    if (!fsIsFile(fpIn)) {
        return Promise.reject(`fpIn[${fpIn}] does not exist`)
    }

    //mode
    let mode = get(opt, 'mode', '')
    if (mode !== 'MicrosoftOffice' && mode !== 'LibreOffice') {
        mode = 'MicrosoftOffice'
    }

    //fpExeLibreOffice
    let fpExeLibreOffice = get(opt, 'fpExeLibreOffice', '')
    if (!isestr(fpExeLibreOffice)) {
        fpExeLibreOffice = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
    }
    if (mode === 'LibreOffice' && !fsIsFile(fpExeLibreOffice)) {
        return Promise.reject(`opt.fpExeLibreOffice[${fpExeLibreOffice}] does not exist`)
    }

    //fdTemp
    let fdTemp = get(opt, 'fdTemp')
    if (!isestr(fdTemp)) {
        fdTemp = `./_convertTempPdf`
    }
    if (!fsIsFolder(fdTemp)) {
        fsCreateFolder(fdTemp)
    }

    //轉絕對路徑
    fpIn = path.resolve(fpIn)

    //id
    let id = `${now2strp()}_${genID(6)}`

    //fnInTemp
    let fnInTemp = `docx2pdf_${id}.docx`

    //fpInTemp
    let fpInTemp = `${fdTemp}/${fnInTemp}`
    fpInTemp = path.resolve(fpInTemp)

    //fsCopyFile
    fsCopyFile(fpIn, fpInTemp)

    //fnOutTemp
    let fnOutTemp = `docx2pdf_${id}.pdf`

    //fpOutTemp
    let fpOutTemp = `${fdTemp}/${fnOutTemp}`
    fpOutTemp = path.resolve(fpOutTemp)

    if (mode === 'MicrosoftOffice') {

        //fnExe
        let fnExe = `cv.exe`

        //fdExe
        let fdExe = ''
        if (true) {
            let fdExeSrc = `${fdSrv}/src/`
            let fdExeNM = `${fdSrv}/node_modules/w-docx2pdf/src/`
            if (fsIsFile(`${fdExeSrc}${fnExe}`)) {
                fdExe = fdExeSrc
            }
            else if (fsIsFile(`${fdExeNM}${fnExe}`)) {
                fdExe = fdExeNM
            }
            else {
                return Promise.reject('can not find folder for docx2pdf')
            }
        }
        // console.log('fdExe', fdExe)

        //prog
        let prog = `${fdExe}${fnExe}`
        // console.log('prog', prog)

        //inp
        let inp = {
            fpIn: fpInTemp,
            fpOut: fpOutTemp,
            opt: {},
        }
        // console.log('inp', inp)

        //input to b64
        let cInput = JSON.stringify(inp)
        let b64Input = str2b64(cInput)
        // console.log('b64Input', b64Input)

        //execProcess
        await execProcess(prog, b64Input)
            .catch((err) => {
                console.log('execProcess catch', err)
                errTemp = err.toString()
            })

        //check
        if (errTemp) {
            return Promise.reject(errTemp)
        }

    }
    else if (mode === 'LibreOffice') {

        //prog
        let prog = fpExeLibreOffice
        // console.log('prog', prog)

        //args
        let args = [
            '--headless',
            '--norestore',
            '--invisible',
            '--convert-to', 'pdf:writer_pdf_Export',
            '--outdir', fdTemp,
            fpInTemp,
        ]

        //execProcess
        await execProcess(prog, args)
            .catch((err) => {
                console.log('execProcess catch', err)
                errTemp = err.toString()
            })

        //check
        if (errTemp) {
            return Promise.reject(errTemp)
        }

    }

    //check
    if (!fsIsFile(fpOutTemp)) {
        return Promise.reject(`can not convert`)
    }

    //fsCopyFile
    fsDeleteFile(fpOut)
    let r = fsCopyFile(fpOutTemp, fpOut)

    //check
    if (r.error) {
        return Promise.reject(r.error)
    }

    //fsDeleteFile
    fsDeleteFile(fpInTemp)
    fsDeleteFile(fpOutTemp)

    return 'ok'
}


export default WDocx2pdf
