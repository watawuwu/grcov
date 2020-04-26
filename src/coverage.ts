const os = require('os');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const archiver = require('archiver');
const glob = require('fast-glob');
const toml = require('@iarna/toml');

import * as core from '@actions/core';


async function getBinNames(root: string): Promise<string[]> {
    let cargoFiles = glob.sync("**/Cargo.toml", {
        cwd: root,
        absolute: true,
        onlyFiles: true,
    });
    core.info(`considering: ${cargoFiles}`);

    let bins: string[] = [];
    for (const file of cargoFiles) {
        const cargoTomlContents = await fsPromises.readFile(file);
        const cargo = toml.parse(cargoTomlContents);

        for (const bin of (cargo['bin'] || [])) {
            if (bin.name) {
                bins.push(bin.name)
            }
        }
    }
    core.info(`bins found: ${bins}`);
    return bins
}

async function getCoverageFiles(root: string): Promise<string[]> {
    const bins = await getBinNames(root);
    core.info(`Found project bins: ${bins}`);

    let patterns: string[] = [];
    for (const bin of bins) {
        const replacement = bin.replace(/-/g, '_');
        patterns.push(`**/${replacement}*.gc*`);
    }

    return glob.sync(patterns, {
        cwd: path.join(root, 'target'),
        absolute: true,
        onlyFiles: true,
    });
}

export async function prepareArchive(root: string): Promise<string> {
    const coverageFiles: string[] = await getCoverageFiles(root);
    if (coverageFiles.length == 0) {
        throw new Error('Unable to find any coverage files, was `cargo test` executed correctly?');
    }

	return new Promise((resolve, reject) => {
	    const postfix = Math.random().toString(36).substring(2, 15)
	    const resultPath = path.join(os.tmpdir(), `coverage-${postfix}.zip`);
	    core.debug(`Creating an archive with coverage files at ${resultPath}`);
        let output = fs.createWriteStream(resultPath, {
            encoding: 'binary',
        });
        let archive = archiver('zip');

		archive.pipe(output);

        for (const coverageFile of coverageFiles) {
            core.info(`Archiving coverage file: ${coverageFile}`);
            archive.file(coverageFile, {
                name: path.basename(coverageFile),
            });
        }

		archive.finalize();

		output.on('close', function() {
		    core.info(`Coverage files archive was created at the ${resultPath}`);
		    resolve(resultPath);
		});
		archive.on('warning', reject);
		archive.on('error', reject);
	});
}
