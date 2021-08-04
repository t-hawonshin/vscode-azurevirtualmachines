/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as async from 'async';
import * as ssh2 from 'ssh2';
import * as SftpClient from 'ssh2-sftp-client';
import { MessageItem, window } from "vscode";
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { viewOutput } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { VirtualMachineTreeItem } from '../tree/VirtualMachineTreeItem';

export async function setDevEnvironment(context: IActionContext, node?: VirtualMachineTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<VirtualMachineTreeItem>(VirtualMachineTreeItem.linuxContextValue, context);
    }

    const vmName: string = node.getVmName();
    const username: string = node.getUser();
    const publicIPAdress: string = await node.getIpAddress();
    const passphrase: string = await context.ui.showInputBox({
        prompt: 'Enter the password for the virtual machine.',
        password: true
    });

    const startSetup: string = localize('startSetup', 'Setting up development environment(Python/C) on virtual machine "{0}"...', vmName);
    ext.outputChannel.appendLog(startSetup);

    const config = {
        host: publicIPAdress,
        username: username,
        password: passphrase,
        port: 8080,
        tryKeyboard: true
    };

    const sftpconn = new SftpClient();
    const current_dir = __dirname.split('/').slice(0, -3).join('/');
    await sftpconn.connect(config).then(() => {
        ext.outputChannel.appendLog('Connection Success');
    });
    await sftpconn.fastPut(current_dir + '/src/commands/.vscode.tar.gz', '.vscode.tar.gz').then(() => {
        return sftpconn.end();
    });

    const cmds = {
        cmd1: 'yes y | sudo tdnf install build-essential gdb',
        cmd2: 'tar -xvf .vscode.tar.gz'
    };

    function remoteSSHFunction(resolve, reject) {
        let cmdsProcessed = 0;
        async.eachSeries(cmds, (onecmd, callback) => {
            //ext.outputChannel.appendLog(onecmd);
            const conn = new ssh2.Client();
            conn.on('error', function (err) {
                ext.outputChannel.appendLog(err.stack as string);
                reject(new Error("An error has occured. Check output window for more details. Make sure Point-to-Site VPN connection is configured"));
            });
            conn.on('ready', () => {
                ext.outputChannel.appendLog('Client :: ready');
                conn.exec(onecmd, (err, stream) => {
                    if (err) throw err;
                    stream.on('close', (code: string, signal: string) => {
                        ext.outputChannel.appendLog('Stream :: close :: code: ' + code as string + ', signal: ' + signal as string);
                        cmdsProcessed++;
                        conn.end();
                        if (cmdsProcessed === Object.keys(cmds).length) {
                            resolve();
                        }
                        return callback();
                    }).on('data', (data: string) => {
                        ext.outputChannel.appendLog('STDOUT: ' + data as string);
                    }).stderr.on('data', (data: string) => {
                        ext.outputChannel.appendLog('STDERR: ' + data as string);
                    });
                });
            }).connect(config);
        }, (err: Error) => {
            ext.outputChannel.appendLog(err.stack as string);
            reject(new Error("An error has occured. Check output window for more details. Make sure Point-to-Site VPN connection is configured"));
        });
    }

    async function awaitFunction() {
        return new Promise((resolve, reject) => {
            remoteSSHFunction(resolve, reject);
        });
    }

    await awaitFunction();

    const finishedSetup: string = localize('finishedSetup', 'Finished development environment(Python/C) set up on virtual machine "{0}".', vmName);
    ext.outputChannel.appendLog(finishedSetup);

    void window.showInformationMessage(finishedSetup, viewOutput).then(async (result: MessageItem | undefined) => {
        await callWithTelemetryAndErrorHandling('postCreateVM', async (c: IActionContext) => {
            c.telemetry.properties.dialogResult = result?.title;
            if (result === viewOutput) {
                ext.outputChannel.show();
            }
        });
    });

}
