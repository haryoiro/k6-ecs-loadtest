import { build } from 'esbuild'
import * as glob from 'glob'

const entryPoints = glob.sync("./load-testing/scenarios/*.ts");

build({
    entryPoints,
    outdir: "./load-testing/dist",
    platform: 'node',
});
