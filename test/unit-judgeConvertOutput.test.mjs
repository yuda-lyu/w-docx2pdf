import fs from 'fs'
import path from 'path'
import assert from 'assert'
import judgeConvertOutput, { judgeConvertFile } from '../src/judgeConvertOutput.mjs'


//純函數測試(不需Word): cv.exe不論成敗離開碼皆為0, 成敗只能依輸出判定(R-CONVERT-RESULT-01)
//樣本取自真cv.exe + 真Word之實測輸出(首行為輸入參數字典之回顯, 轉檔例外時印錯誤字典單行且其後仍印success)
describe('judgeConvertOutput', function() {

    let prefix = '[E_CONVERT_FAILED] '
    let echo = `{'fpIn': 'C:\\\\secret\\\\in.docx', 'fpOut': 'C:\\\\secret\\\\out.pdf', 'opt': {}}`
    let reasonWord = `(-2147352567, '發生例外狀況。', (0, 'Microsoft Word', '檔案似乎已毀損。', 'wdmain11.chm', 25272, -2146822496), None)`
    let errDict = `{'type': <class 'pywintypes.com_error'>, 'message': "${reasonWord}", 'traceback': [{'name': 'cv', 'filename': 'cv.py'}, {'name': 'docxToPdf', 'filename': 'cv.py'}, {'name': 'Open', 'filename': '<COMObject <unknown>>'}]}`

    describe('success (output carries the "success" line and no failure marker)', function() {

        it('judges the real success output (echo line + "success") as ok (R02: a valid conversion is not rejected)', function() {
            assert.strict.deepStrictEqual(judgeConvertOutput(`${echo}\r\nsuccess\r\n`), { ok: true, msg: '' })
            assert.strict.deepStrictEqual(judgeConvertOutput(`${echo}\nsuccess\n`), { ok: true, msg: '' })
            assert.strict.deepStrictEqual(judgeConvertOutput('success'), { ok: true, msg: '' })
        })

        it('tolerates the stderr notice "Word instance is kept since ..." merged before or after the success line (R02, R-WORD-02)', function() {
            let notice = 'Word instance is kept since 1 document(s) opened by another client'
            assert.strict.equal(judgeConvertOutput(`${echo}\r\n${notice}\r\nsuccess\r\n`).ok, true)
            assert.strict.equal(judgeConvertOutput(`${echo}\r\nsuccess\r\n${notice}\r\n`).ok, true)
            assert.strict.equal(judgeConvertOutput(`${notice}\r\n\r\n  success  \r\n`).ok, true)
        })

        it('counts failure markers only at the start of a line: the echo line may contain "error:" or a dict-like text inside a path (R02)', function() {
            let echo2 = `{'fpIn': 'C:\\\\a error: b\\\\{'type': 1, 'message': 2, 'traceback': []}.docx', 'fpOut': 'x.pdf', 'opt': {}}`
            assert.strict.equal(judgeConvertOutput(`${echo2}\r\nsuccess\r\n`).ok, true)
            assert.strict.equal(judgeConvertOutput(`prefix ${errDict}\r\nsuccess\r\n`).ok, true)
        })

    })

    describe('failure reported by the exe as an "error:" line (outer failure, exit code 0)', function() {

        it('judges the invalid-argv output as failure with the code and the reason (R01)', function() {
            assert.strict.deepStrictEqual(judgeConvertOutput('error: invalid length of argv\r\n'), { ok: false, msg: `${prefix}invalid length of argv` })
        })

        it('uses the text after "error:" as the reason (R01)', function() {
            let r = judgeConvertOutput(`${echo}\r\nerror: 'cp950' codec can't encode character\r\n`)
            assert.strict.equal(r.ok, false)
            assert.strict.equal(r.msg, `${prefix}'cp950' codec can't encode character`)
        })

        it('gives a non-empty fixed reason when the "error:" line carries no text (R01)', function() {
            for (let s of ['error:', 'error:\r\n', 'error:   \r\n']) {
                let r = judgeConvertOutput(s)
                assert.strict.equal(r.ok, false, s)
                assert.strict.equal(r.msg.startsWith(prefix), true, s)
                assert.strict.equal(r.msg.length > prefix.length, true, s)
            }
        })

        it('fails closed: an "error:" line wins even when a "success" line is also present (R01, R03)', function() {
            assert.strict.equal(judgeConvertOutput('success\r\nerror: x\r\n').ok, false)
            assert.strict.equal(judgeConvertOutput('error: x\r\nsuccess\r\n').ok, false)
            assert.strict.equal(judgeConvertOutput('success\r\nerror: x\r\n').msg, `${prefix}x`)
        })

        it('takes the first "error:" line as the reason when there are several', function() {
            assert.strict.equal(judgeConvertOutput('error: first\r\nerror: second\r\n').msg, `${prefix}first`)
        })

    })

    describe('failure reported by the exe as the error dict line (conversion exception, the "success" line still follows, exit code 0)', function() {

        it('judges the real failure output (echo + error dict + "success") as failure with the Word diagnosis as the reason (R01)', function() {
            let r = judgeConvertOutput(`${echo}\r\n${errDict}\r\nsuccess\r\n`)
            assert.strict.deepStrictEqual(r, { ok: false, msg: `${prefix}${reasonWord}` })
        })

        it('does not echo the input path or the rest of the output (R04)', function() {
            let r = judgeConvertOutput(`${echo}\r\n${errDict}\r\nsuccess\r\n`)
            assert.strict.equal(r.msg.includes('secret'), false)
            assert.strict.equal(r.msg.includes('traceback'), false)
            assert.strict.equal(r.msg.includes('success'), false)
        })

        it('restores the Python repr of the message: single-quoted with escaped quote, double-quoted, backslash, \\n, \\xNN, \\uNNNN', function() {
            let mk = (reprMsg) => `{'type': <class 'x.err'>, 'message': ${reprMsg}, 'traceback': []}`
            assert.strict.equal(judgeConvertOutput(mk(`'it\\'s bad'`)).msg, `${prefix}it's bad`)
            assert.strict.equal(judgeConvertOutput(mk(`"it's \\"bad\\""`)).msg, `${prefix}it's "bad"`)
            assert.strict.equal(judgeConvertOutput(mk(`'C:\\\\dir\\\\f.docx'`)).msg, `${prefix}C:\\dir\\f.docx`)
            assert.strict.equal(judgeConvertOutput(mk(`'line1\\nline2\\tx'`)).msg, `${prefix}line1 line2 x`)
            assert.strict.equal(judgeConvertOutput(mk(`'a\\x41b\\u4e2dc'`)).msg, `${prefix}aAb中c`)
        })

        it('keeps a message that itself contains ", \'traceback\': [" text (the last marker is the real one)', function() {
            let s = `{'type': <class 'x.err'>, 'message': "a, 'traceback': [ b", 'traceback': [{'name': 'cv', 'filename': 'cv.py'}]}`
            assert.strict.equal(judgeConvertOutput(s).msg, `${prefix}a, 'traceback': [ b`)
        })

        it('gives a non-empty fixed reason when the message is empty or its quotes are unbalanced (e.g. AssertionError has an empty message)', function() {
            let mk = (reprMsg) => `{'type': <class 'AssertionError'>, 'message': ${reprMsg}, 'traceback': []}`
            for (let s of [mk(`''`), mk(`""`), mk(`'  '`), mk(`abc`), mk(`'abc`)]) {
                let r = judgeConvertOutput(`${s}\r\nsuccess\r\n`)
                assert.strict.equal(r.ok, false, s)
                assert.strict.equal(r.msg.startsWith(prefix), true, s)
                assert.strict.equal(r.msg.length > prefix.length, true, s)
                assert.strict.equal(r.msg.includes('traceback'), false, s)
            }
        })

        it('fails closed: the error dict wins even when the "success" line comes before it', function() {
            assert.strict.equal(judgeConvertOutput(`success\r\n${errDict}\r\n`).ok, false)
        })

        it('takes the first failure marker in output order as the reason, whether it is an error dict or an "error:" line', function() {
            assert.strict.equal(judgeConvertOutput(`${errDict}\r\nerror: later\r\n`).msg, `${prefix}${reasonWord}`)
            assert.strict.equal(judgeConvertOutput(`error: earlier\r\n${errDict}\r\n`).msg, `${prefix}earlier`)
        })

    })

    describe('fails closed on anything that is not the success output (R03)', function() {

        let msgNo = `${prefix}cv.exe returned no success result`

        it('judges empty or blank output as failure', function() {
            for (let s of ['', ' ', '\r\n', '\n\n']) {
                assert.strict.deepStrictEqual(judgeConvertOutput(s), { ok: false, msg: msgNo }, JSON.stringify(s))
            }
        })

        it('judges the echo line without a result line as failure (the process died after printing it)', function() {
            assert.strict.deepStrictEqual(judgeConvertOutput(`${echo}\r\n`), { ok: false, msg: msgNo })
        })

        it('judges unknown output as failure and does not echo it (R04)', function() {
            let s = 'Traceback: C:\\secret\\input.docx failed'
            let r = judgeConvertOutput(s)
            assert.strict.deepStrictEqual(r, { ok: false, msg: msgNo })
            assert.strict.equal(r.msg.includes('secret'), false)
        })

        it('requires the whole line to be "success" (lookalikes are not success)', function() {
            for (let s of ['successful', 'not success', 'success: no', 'Success', 'SUCCESS', 'succes', 'xsuccess', `${echo} success`]) {
                assert.strict.equal(judgeConvertOutput(s).ok, false, s)
            }
        })

        it('judges non-string input as failure without throwing (R05)', function() {
            let vs = [undefined, null, 0, 1, true, false, {}, [], ['success'], () => 'success', Symbol('x'), NaN]
            for (let v of vs) {
                let r = null
                assert.strict.doesNotThrow(() => {
                    r = judgeConvertOutput(v)
                })
                assert.strict.deepStrictEqual(r, { ok: false, msg: msgNo }, String(typeof v))
            }
        })

    })

})


describe('judgeConvertFile', function() {

    let prefix = '[E_CONVERT_FAILED] '
    let fdt = path.resolve('./test/_tmp/unit-judgeConvertOutput')

    before(function() {
        fs.rmSync(fdt, { recursive: true, force: true })
        fs.mkdirSync(path.join(fdt, 'folder.pdf'), { recursive: true })
        fs.writeFileSync(path.join(fdt, 'ok.pdf'), '%PDF-1.7\n')
        fs.writeFileSync(path.join(fdt, 'empty.pdf'), '')
    })

    after(function() {
        fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        try {
            fs.rmdirSync(path.resolve('./test/_tmp')) //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    })

    it('judges an existing non-empty file as ok', function() {
        assert.strict.deepStrictEqual(judgeConvertFile(path.join(fdt, 'ok.pdf')), { ok: true, msg: '' })
    })

    it('judges a missing file as failure with a fixed reason that does not echo the path (R07)', function() {
        let r = judgeConvertFile(path.join(fdt, 'missing-secret.pdf'))
        assert.strict.deepStrictEqual(r, { ok: false, msg: `${prefix}output file was not generated or is empty` })
        assert.strict.equal(r.msg.includes('secret'), false)
    })

    it('judges an empty file as failure (R07)', function() {
        assert.strict.equal(judgeConvertFile(path.join(fdt, 'empty.pdf')).ok, false)
    })

    it('judges a folder as failure (R07)', function() {
        assert.strict.equal(judgeConvertFile(path.join(fdt, 'folder.pdf')).ok, false)
    })

    it('judges a non-string or empty path as failure without throwing (R07)', function() {
        for (let v of [undefined, null, '', 0, {}, [], true]) {
            let r = null
            assert.strict.doesNotThrow(() => {
                r = judgeConvertFile(v)
            })
            assert.strict.equal(r.ok, false, String(typeof v))
        }
    })

})
