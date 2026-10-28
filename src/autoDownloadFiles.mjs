import ensureBins from './ensureBins.mjs'


/**
 * 取得cv.exe，回傳cv.exe的絕對路徑
 *
 * 相容舊公開子路徑w-docx2pdf/src/autoDownloadFiles.mjs，內部轉呼叫ensureBins：
 * 首次使用時下載(或自鏡像取得)並以bin/manifest.json校驗，之後自快取取得，不再於安裝時(postinstall)下載，亦不再自行定位src/cv.exe，
 * 快取位置與離線部署見README〈外部執行檔〉
 *
 * 因cv.exe只能用於Windows作業系統，故調用前須自行檢核作業系統
 *
 * @returns {Promise} 回傳Promise，resolve回傳執行檔路徑物件，內含fpExe為cv.exe的絕對路徑字串，reject回傳帶code之Error
 * @example
 * import autoDownloadFiles from 'w-docx2pdf/src/autoDownloadFiles.mjs'
 *
 * async function test() {
 *
 *     let { fpExe } = await autoDownloadFiles()
 *
 *     console.log('fpExe', fpExe)
 *     // fpExe D:\xxx\node_modules\w-docx2pdf\bin-cache\<sha256>\cv.exe
 * }
 * test()
 *     .catch((err) => {
 *         console.log('catch', err)
 *     })
 *
 */
async function autoDownloadFiles() {

    //ensureBins
    let bins = await ensureBins({ names: 'cv.exe' })

    return {
        fpExe: bins['cv.exe'],
    }
}


export default autoDownloadFiles
