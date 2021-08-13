/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as async from 'async';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import { join } from 'path';
import * as SSHConfig from 'ssh-config';
import * as ssh2 from 'ssh2';
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

    const azureEmail: string = node.getAzureEmail();
    const azureUsername: string = azureEmail.split("@")[0];
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

    const current_dir = path.join(__dirname, '..', '..', '..') + '/src/files/';
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let source;
    let prjNameVer: string;
    if (dev == "Python") {
        prjNameVer = prjName + '-0.1.1';
    } else {
        prjNameVer = prjName + '-1.0';
    }
    const dir = path.join(current_dir, prjNameVer);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
        if (dev == "Python") {
            fs.copyFileSync(path.join(current_dir, 'python_project', 'main.py'), path.join(dir, 'main.py'));
            fs.copyFileSync(path.join(current_dir, 'python_project', '.vscode.tar.gz'), path.join(dir, '.vscode.tar.gz'));
            source = fs.readFileSync(path.join(current_dir, 'python_template.spec')).toString();
        } else {
            fs.copyFileSync(path.join(current_dir, 'c_project', 'main.c'), path.join(dir, 'main.c'));
            fs.copyFileSync(path.join(current_dir, 'c_project', '.vscode.tar.gz'), path.join(dir, '.vscode.tar.gz'));
            const makeSource = fs.readFileSync(path.join(current_dir, 'c_project', 'Makefile')).toString();
            const makeTemplate = Handlebars.compile(makeSource);
            const makeContents = makeTemplate({ name: prjName });
            fs.writeFile(path.join(dir, 'Makefile'), makeContents, err => {
                if (err) { throw err; }
            });
            source = fs.readFileSync(path.join(current_dir, 'c_template.spec')).toString();
        }
        const template = Handlebars.compile(source);
        const contents = template({
            name: prjName,
            username: azureUsername,
            email: azureEmail,
            date: [days[now.getDay()], months[now.getMonth()], now.getDate().toString(), now.getFullYear().toString()].join(' ')
        });
        fs.writeFile(path.join(dir, prjName + '.spec'), contents, err => {
            if (err) { throw err; }
        });
    }

    const config = {
        host: publicIpAdress,
        username: username,
        port: 8080,
        password: await context.ui.showInputBox({ prompt: 'Enter the password for the virtual machine.', password: true })
    };

    const sftpconn = new SftpClient();
    const remotefilepath = '/home/' + username + '/project/' + prjNameVer;
    await sftpconn.connect(config).then(() => {
        ext.outputChannel.appendLog('Connection Success');
    });
    if (await sftpconn.exists(remotefilepath) == false) {
        await sftpconn.mkdir(remotefilepath, true);
    }
    await sftpconn.uploadDir(path.join(current_dir, prjNameVer), remotefilepath).then(() => {
        return sftpconn.end();
    });

    function remoteSSHFunction(cmds, config, resolve: (reason?: any) => void, reject: (reason?: any) => void) {
        let cmdsProcessed = 0;
        async.eachSeries(cmds, (onecmd: string, callback) => {
            const conn = new ssh2.Client();
            conn.on('error', function (err) {
                ext.outputChannel.appendLog(err.stack as string);
                reject(new Error("An error has occured while connecting to the remote host"));
            });
            conn.on('ready', () => {
                conn.exec(onecmd, (err, stream) => {
                    if (err) throw err;
                    stream.on('close', (code: string, signal: string) => {
                        console.log('Stream :: close :: code: ' + code as string + ', signal: ' + signal as string);
                        cmdsProcessed++;
                        conn.end();
                        if (cmdsProcessed === Object.keys(cmds).length) {
                            resolve();
                        }
                        return callback();
                    }).on('data', (data: string) => {
                        ext.outputChannel.appendLog(data as string);
                    }).stderr.on('data', (data: string) => {
                        ext.outputChannel.appendLog('STDERR: ' + data as string);
                    });
                });
            }).connect(config);
        }, (err: Error) => {
            ext.outputChannel.appendLog(err.stack as string);
            reject(new Error("An error has occured while connecting to the remote host"));
        });
    }

    async function awaitFunction(cmds, config) {
        return new Promise((resolve, reject) => {
            remoteSSHFunction(cmds, config, resolve, reject);
        });
    }

    const cmd = {
        cmd1: 'dos2unix project/' + prjNameVer + '/' + prjName + '.spec',
        cmd2: 'tar -xvf project/' + prjNameVer + '/.vscode.tar.gz -C project/' + prjNameVer,
        cmd3: 'sudo rm -rf project/' + prjNameVer + '/.vscode.tar.gz'
    };

    await awaitFunction(cmd, config);

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
