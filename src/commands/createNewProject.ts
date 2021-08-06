/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as SftpClient from 'ssh2-sftp-client';
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { VirtualMachineTreeItem } from '../tree/VirtualMachineTreeItem';


export async function createNewProject(context: IActionContext, node?: VirtualMachineTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<VirtualMachineTreeItem>(VirtualMachineTreeItem.linuxContextValue, context);
    }

    const vmName: string = node.getVmName();
    const username: string = node.getUser();
    const publicIpAdress: string = await node.getIpAddress();
    const passphrase: string = await context.ui.showInputBox({
        prompt: 'Enter the password for the virtual machine.',
        password: true
    });
    const placeHolder: string = localize('selecDev', 'Select a Developoment Language.');
    const dev: string = (await context.ui.showQuickPick([
        { label: 'python' },
        { label: 'C' }
    ], { placeHolder })).label;
    const prjName: string = await context.ui.showInputBox({ prompt: 'Enter the project name.' });

    const creatingProject: string = localize('creatingProject', 'creating new {0} Project {1} on virtual machine "{2}"...', dev, prjName, vmName);
    ext.outputChannel.appendLog(creatingProject);


    const current_dir = path.join(__dirname, '..', '..', '..') + '/src/files/';
    const dir = current_dir + prjName
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
        if (dev == "python") {
            fs.copyFile(path.join(current_dir, 'pello.py'), path.join(dir, prjName + '.py'), (err) => {
                if (err) throw err;
                console.log('source was copied to destination file');
            });
        } else {
            fs.copyFile(path.join(current_dir, 'cello.c'), path.join(dir, prjName + '.c'), (err) => {
                if (err) throw err;
                console.log('source was copied to destination file');
            });

        }
    }

    const config = {
        host: publicIpAdress,
        username: username,
        password: passphrase,
        port: 8080,
        tryKeyboard: true
    };

    const sftpconn = new SftpClient();

    await sftpconn.connect(config).then(() => {
        ext.outputChannel.appendLog('Connection Success');
    });

    await sftpconn.uploadDir(path.join(current_dir, prjName), '/home/' + username + '/' + prjName).then(() => {
        return sftpconn.end();
    });

    fs.rmdir(dir, { recursive: true }, (err) => {
        if (err) throw err;
        console.log(`${dir} is deleted!`);
    });

    const createdProject: string = localize('createdProject', 'created new {0} Project {1} on virtual machine "{2}".', dev, prjName, vmName);
    ext.outputChannel.appendLog(createdProject);

}
