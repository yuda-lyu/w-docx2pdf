import fs from 'fs'
import w from 'wsemi'
import assert from 'assert'
import WDocx2pdf from '../src/WDocx2pdf.mjs'


function isWindows() {
    return process.platform === 'win32'
}


describe('WDocx2pdf', function() {

    //check
    if (!isWindows()) {
        return
    }

    let fpOutTrue = `./test/ztmpTrue.pdf`

    let fpIn = `./test/ztmp.docx`
    let fpOut = `./test/ztmp.pdf`
    let opt = {}

    it('convert', async function() {
        await WDocx2pdf(fpIn, fpOut, opt)
        let r = (fs.statSync(fpOut)).size
        let rr = (fs.statSync(fpOutTrue)).size
        w.fsDeleteFile(fpOut)
        assert.strict.deepEqual(r, rr)
    })

})
