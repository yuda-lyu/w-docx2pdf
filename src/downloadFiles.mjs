import fsDownloadFile from 'wsemi/src/fsDownloadFile.mjs'


async function downloadFiles(fdBase) {

    //url
    let url = `https://github.com/yuda-lyu/w-docx2pdf/raw/refs/heads/master/src/cv.exe`
    // console.log('url',url)

    //fn
    let fn = `cv.exe`

    //fp
    let fp = `${fdBase}${fn}`

    //fsDownloadFile
    console.log(`downloading url[${url}]...`, `to fp[${fp}]`)
    await fsDownloadFile(url, fp)

}


export default downloadFiles
