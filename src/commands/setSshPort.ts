/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as async from 'async';
import * as ssh2 from 'ssh2';
import { MessageItem, window } from "vscode";
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { viewOutput } from '../constants';
import { ext } from '../extensionVariables';
import { localize } from '../localize';
import { VirtualMachineTreeItem } from '../tree/VirtualMachineTreeItem';



export async function setSshPort(context: IActionContext, node?: VirtualMachineTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<VirtualMachineTreeItem>(VirtualMachineTreeItem.linuxContextValue, context);
    }

    const vmName: string = node.getVmName();
    const username: string = node.getUser();
    const privateIPAdress: string = await node.getPrivateIpAddress();
    const passphrase: string = await context.ui.showInputBox({
        prompt: 'Enter the password for the virtual machine.',
        password: true
    });

    const openingPort: string = localize('openingPort', 'Opening Port 8080 on virtual machine "{0}"...', vmName);
    ext.outputChannel.appendLog(openingPort);

    const cmds = {
        cmd1: 'sudo bash -c "echo \'Port 8080\nPort 22\nAllowTCPFORWARDING=yes\' >> /etc/ssh/sshd_config"',
        cmd2: 'sudo iptables -A INPUT -p tcp -m tcp --dport 8080 -j ACCEPT',
        cmd3: 'sudo systemctl restart sshd'
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
            }).connect({
                host: privateIPAdress,
                username: username,
                password: passphrase,
                port: 22,
                tryKeyboard: true
            });
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

    const openedPort: string = localize('openedPort', 'Opened Port 8080 on virtual machine "{0}".', vmName);
    ext.outputChannel.appendLog(openedPort);

    void window.showInformationMessage(openedPort, viewOutput).then(async (result: MessageItem | undefined) => {
        await callWithTelemetryAndErrorHandling('postCreateVM', async (c: IActionContext) => {
            c.telemetry.properties.dialogResult = result?.title;
            if (result === viewOutput) {
                ext.outputChannel.show();
            }
        });
    });

}
