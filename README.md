# w-docx2pdf
A tool for docx2pdf.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-docx2pdf.svg?style=flat)](https://npmjs.org/package/w-docx2pdf) 
[![license](https://img.shields.io/npm/l/w-docx2pdf.svg?style=flat)](https://npmjs.org/package/w-docx2pdf) 
[![npm download](https://img.shields.io/npm/dt/w-docx2pdf.svg)](https://npmjs.org/package/w-docx2pdf) 
[![npm download](https://img.shields.io/npm/dm/w-docx2pdf.svg)](https://npmjs.org/package/w-docx2pdf) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-docx2pdf.svg)](https://www.jsdelivr.com/package/npm/w-docx2pdf)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-docx2pdf/global.html).

## Core
> `w-docx2pdf` is based on the `docx2pdf` in `python`, and only run in `Windows`.

## Installation
### Using npm(ES6 module):
```alias
npm i w-docx2pdf
```

#### Example:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-docx2pdf/blob/master/g.mjs)]
```alias
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
```
