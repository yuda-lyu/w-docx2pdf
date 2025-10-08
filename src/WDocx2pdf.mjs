import path from 'path'
import process from 'process'
import genID from 'wsemi/src/genID.mjs'
import str2b64 from 'wsemi/src/str2b64.mjs'
import execProcess from 'wsemi/src/execProcess.mjs'
import fsIsFile from 'wsemi/src/fsIsFile.mjs'
import fsDeleteFile from 'wsemi/src/fsDeleteFile.mjs'
import fsRenameFile from 'wsemi/src/fsRenameFile.mjs'


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

    //id
    let id = genID()

    //fpOutTemp
    let fpOutTemp = `./${id}.pdf`

    //轉絕對路徑
    fpIn = path.resolve(fpIn)
    fpOutTemp = path.resolve(fpOutTemp)

    //inp
    let inp = {
        fpIn,
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

    //check
    if (!fsIsFile(fpOutTemp)) {
        return Promise.reject(`can not convert`)
    }

    //fsRenameFile
    fsDeleteFile(fpOut)
    let r = fsRenameFile(fpOutTemp, fpOut)

    //check
    if (r.error) {
        return Promise.reject(r.error)
    }

    return 'ok'
}


export default WDocx2pdf
