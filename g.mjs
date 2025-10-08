import w from 'wsemi'
import WDocx2pdf from './src/WDocx2pdf.mjs'
//import WDocx2pdf from 'w-docx2pdf/src/WDocx2pdf.mjs'
//import WDocx2pdf from 'w-docx2pdf'


async function test() {

    let fpIn = `./test/ztmp.docx`
    let fpOut = `./test/ztmp.pdf`
    let opt = {}

    let r = await WDocx2pdf(fpIn, fpOut, opt)
    console.log(r)
    // => ok

    w.fsDeleteFile(fpOut)

}
test()
    .catch((err) => {
        console.log('catch', err)
    })


//node g.mjs
