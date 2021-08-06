/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import { join } from 'path';
import * as SSHConfig from 'ssh-config';
import * as SftpClient from 'ssh2-sftp-client';
import { commands, MessageItem, window } from "vscode";
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { sshFsPath, viewOutput } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { VirtualMachineTreeItem } from '../tree/VirtualMachineTreeItem';
import { addSshKey } from './addSshKey';
import { verifyRemoteSshExtension } from './verifyRemoteSshExtension';


export async function createNewProject(context: IActionContext, node?: VirtualMachineTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<VirtualMachineTreeItem>(VirtualMachineTreeItem.linuxContextValue, context);
    }

    const vmName: string = node.getVmName();
    const username: string = node.getUser();
    const publicIpAdress: string = await node.getIpAddress();
    const placeHolder: string = localize('selecDev', 'Select a Developoment Language.');
    const dev: string = (await context.ui.showQuickPick([
        { label: 'Python' },
        { label: 'C' }
    ], { placeHolder })).label;
    const prjName: string = await context.ui.showInputBox({ prompt: 'Enter the project name.' });

    const creatingProject: string = localize('creatingProject', 'creating new {0} Project {1} on virtual machine "{2}"...', dev, prjName, vmName);
    ext.outputChannel.appendLog(creatingProject);

    function copyDirectory(source, destination) {
        fs.mkdirSync(destination, { recursive: true });
        fs.readdirSync(source, { withFileTypes: true }).forEach((entry) => {
            const sourcePath = path.join(source, entry.name);
            const destinationPath = path.join(destination, entry.name);

            entry.isDirectory()
                ? copyDirectory(sourcePath, destinationPath)
                : fs.copyFileSync(sourcePath, destinationPath);
        });
    }

    const current_dir = path.join(__dirname, '..', '..', '..') + '/src/files/';
    const dir = current_dir + prjName
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    let source;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
        if (dev == "python") {
            copyDirectory(path.join(current_dir, 'python_project'), path.join(current_dir, prjName));
            source = fs.readFileSync(path.join(current_dir, 'python_template.spec')).toString();
        } else {
            copyDirectory(path.join(current_dir, 'c_project'), path.join(current_dir, prjName));
            source = fs.readFileSync(path.join(current_dir, 'c_template.spec')).toString();
        }
        const template = Handlebars.compile(source);
        const contents = template({
            name: prjName,
            username: username,
            date: [days[now.getDay()], months[now.getMonth()], now.getDate().toString(), now.getFullYear().toString()].join(' ')
        });
        fs.writeFile(path.join(current_dir, prjName, 'main.spec'), contents, err => {
            if (err) { throw err; }
        });
    }

    const config = {
        host: publicIpAdress,
        username: username,
        port: 8080,
        password: await context.ui.showInputBox({ prompt: 'Enter the password for the virtual machine.', password: true })
        //privateKey: fs.readFileSync(path.join(sshFsPath, 'azure_hawons-test-vm_rsa')),
        //passphrase: await context.ui.showInputBox({ prompt: 'Enter the password for the virtual machine.', password: true })
    };

    const sftpconn = new SftpClient();
    await sftpconn.connect(config).then(() => {
        ext.outputChannel.appendLog('Connection Success');
    });
    await sftpconn.uploadDir(path.join(current_dir, prjName), '/home/' + username + '/project/' + prjName).then(() => {
        return sftpconn.end();
    });

    fs.rmdir(dir, { recursive: true }, (err) => {
        if (err) throw err;
        console.log(`${dir} is deleted!`);
    });

    const createdProject: string = localize('createdProject', 'created new {0} Project {1} on virtual machine "{2}".', dev, prjName, vmName);
    ext.outputChannel.appendLog(createdProject);

    void window.showInformationMessage(createdProject, viewOutput).then(async (result: MessageItem | undefined) => {
        await callWithTelemetryAndErrorHandling('postCreateVM', async (c: IActionContext) => {
            c.telemetry.properties.dialogResult = result?.title;
            if (result === viewOutput) {
                ext.outputChannel.show();
            }
        });
    });

    await verifyRemoteSshExtension(context);

    const sshConfigPath: string = join(sshFsPath, 'config');
    await fse.ensureFile(sshConfigPath);
    const configFile: string = (await fse.readFile(sshConfigPath)).toString();
    const sshConfig: SSHConfig.HostConfigurationDirective[] = <SSHConfig.HostConfigurationDirective[]>SSHConfig.parse(configFile);
    const hostName: string = await node.getIpAddress();

    const hostConfig: SSHConfig.HostConfigurationDirective | undefined = sshConfig.find(hostEntry => {
        return hostEntry.config && hostEntry.config.find(config => {
            const castedConfig: SSHConfig.BaseConfigurationDirective = <SSHConfig.BaseConfigurationDirective>config;
            return castedConfig.param === 'HostName' && castedConfig.value === hostName;
        });
    });

    let host: string;
    if (hostConfig === undefined) {
        await context.ui.showWarningMessage(localize('unableFind', 'Unable to find host "{0}" in SSH config.', node.name), { title: localize('addSSH', 'Add new SSH config host') });
        await addSshKey(context, node);
        host = node.name;
    } else {
        host = Array.isArray(hostConfig.value) ? hostConfig.value[0] : hostConfig.value;
    }

    await commands.executeCommand('opensshremotes.openEmptyWindowInCurrentWindow', { host });

}
