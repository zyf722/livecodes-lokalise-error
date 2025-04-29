import { LokaliseApi } from '@lokalise/node-api';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { exit } from 'process';

const api = new LokaliseApi({
    apiKey: process.env.LOKALISE_API_TOKEN,
});
const projectID = process.env.LOKALISE_PROJECT_ID;

const importFromLokalise = async () => {
    const ciMode = process.env.CI === 'true';
    const forceLocalMode = process.argv.slice(2).includes('--force');
    const useLocalResourcesMode = process.argv.slice(2).includes('--local');

    if (!ciMode && !forceLocalMode) {
        console.error('This script is intended to be run in CI mode or with --force flag.');
        exit(1);
    }

    const branchName = process.argv[2];

    if (!branchName) {
        console.error('Branch name is required');
        exit(1);
    }

    const lokaliseTempDir = path.resolve(process.env.LOKALISE_TEMP);

    if (!useLocalResourcesMode) {
        console.log('Fetching translations from Lokalise...');

        const fullProjectId = `${projectID}:${branchName}`;
        const process = await api.files().async_download(fullProjectId, {
            format: 'json',
            original_filenames: true,
            json_unescaped_slashes: true,
            replace_breaks: false,
            placeholder_format: 'i18n',
        });

        // Wait until process is finished
        const timeout = 120000;
        const delay = 2500;
        const startTime = Date.now();

        /** @type {import("@lokalise/node-api").DownloadedFileProcessDetails} */
        let response;

        while (true) {
            const processInfo = await api.queuedProcesses()
                .get(process.process_id, { project_id: fullProjectId });

            if (processInfo.status === 'finished') {
                response = processInfo.details;
                break;
            }

            if (Date.now() - startTime > timeout) {
                console.error('Timeout exceeded. Aborting...');
                exit(1);
            }

            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        console.log(`Downloading zip file from ${response.download_url}`);

        const zipPath = path.join(lokaliseTempDir, 'locales.zip');
        const zipFile = await fetch(response.download_url);
        await fs.promises.writeFile(zipPath, Buffer.from(await zipFile.arrayBuffer()));

        console.log(`Extracting zip file to ${lokaliseTempDir}...`);
        execSync(`unzip -o ${zipPath} -d ${lokaliseTempDir}`);
        await fs.promises.unlink(zipPath);
    }
};

importFromLokalise();
