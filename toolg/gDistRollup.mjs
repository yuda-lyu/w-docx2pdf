import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'
import getFiles from 'w-package-tools/src/getFiles.mjs'


let fdSrc = './src'
let fdTar = './dist'


rollupFiles({
    fns: 'WDocx2pdf.mjs',
    fdSrc,
    fdTar,
    hookNameDist: () => 'w-docx2pdf',
    // nameDistType: 'kebabCase', //直接由hookNameDist給予
    globals: {
        'path': 'path',
        'fs': 'fs',
        'process': 'process',
        'child_process': 'child_process',
    },
    external: [
        'path',
        'fs',
        'process',
        'child_process',
    ],
})

