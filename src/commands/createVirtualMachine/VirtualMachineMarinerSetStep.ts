/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NetworkManagementModels } from '@azure/arm-network';
import * as async from 'async';
import * as path from 'path';
import * as ssh2 from 'ssh2';
import * as SftpClient from 'ssh2-sftp-client';
import { MessageItem, Progress, window } from "vscode";
import { AzureWizardExecuteStep, callWithTelemetryAndErrorHandling, IActionContext } from "vscode-azureextensionui";
import { viewOutput } from '../../constants';
import { ext } from '../../extensionVariables';
import { localize } from '../../localize';
import { nonNullProp } from '../../utils/nonNull';
import { IVirtualMachineWizardContext } from './IVirtualMachineWizardContext';


export class VirtualMachineMarinerSetStep extends AzureWizardExecuteStep<IVirtualMachineWizardContext> {
    public priority: number = 270;

    public async execute(context: IVirtualMachineWizardContext, progress: Progress<{ message?: string | undefined; increment?: number | undefined }>): Promise<void> {

        const vmName: string = nonNullProp(context, 'newVirtualMachineName');
        const username: string = nonNullProp(context, 'adminUsername');
        const passphrase: string = nonNullProp(context, 'passphrase');
        const ip: NetworkManagementModels.PublicIPAddress = nonNullProp(context, 'publicIpAddress');
        const publicIpAdress: string = nonNullProp(ip, 'ipAddress');

        const openingPort: string = localize('openingPort', 'Opening Port 8080 on virtual machine "{0}"...', vmName);
        ext.outputChannel.appendLog(openingPort);

        const cmd1 = {
            cmd1: 'sudo bash -c "echo \'Port 8080\nPort 22\nAllowTCPFORWARDING=yes\n\' | cat - /etc/ssh/sshd_config > temp && mv temp /etc/ssh/sshd_config"',
            cmd2: 'sudo iptables -A INPUT -p tcp -m tcp --dport 8080 -j ACCEPT',
            cmd3: 'sudo systemctl restart sshd'
        };

        const config1 = {
            host: publicIpAdress,
            username: username,
            password: passphrase,
            port: 22,
            tryKeyboard: true
        };

        function remoteSSHFunction(cmds, config, resolve: (reason?: any) => void, reject: (reason?: any) => void) {
            let cmdsProcessed = 0;
            async.eachSeries(cmds, (onecmd: string, callback) => {
                //ext.outputChannel.appendLog(onecmd);
                const conn = new ssh2.Client();
                conn.on('error', function (err) {
                    ext.outputChannel.appendLog(err.stack as string);
                    reject(new Error("An error has occured while connecting to the remote host"));
                });
                conn.on('ready', () => {
                    //ext.outputChannel.appendLog('Client :: ready');
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

        await awaitFunction(cmd1, config1);

        const openedPort: string = localize('openedPort', 'Opened Port 8080 on virtual machine "{0}".', vmName);
        ext.outputChannel.appendLog(openedPort);

        const startSetup: string = localize('startSetup', 'Setting up development environment(Python/C) on virtual machine "{0}"...', vmName);
        ext.outputChannel.appendLog(startSetup);
        progress.report({ message: startSetup });


        const config = {
            host: publicIpAdress,
            username: username,
            password: passphrase,
            port: 8080,
            tryKeyboard: true
        };

        const sftpconn = new SftpClient();
        const current_dir = path.join(__dirname, '..', '..', '..', '..');

        await sftpconn.connect(config).then(() => {
            ext.outputChannel.appendLog('Connection Success');
        });

        await sftpconn.fastPut(path.join(current_dir, 'src', 'files', '.vscode.tar.gz'), '.vscode.tar.gz').then(() => {
            return sftpconn.end();
        });

        const cmd2 = {
            cmd1: 'yes y | sudo tdnf install build-essential gdb',
            cmd2: 'yes y | sudo tdnf install dos2unix',
            cmd3: 'tar -xvf .vscode.tar.gz',
            cmd4: 'sudo rm -rf .vscode.tar.gz',
            cmd5: 'mkdir project',
        };

        const config2 = {
            host: publicIpAdress,
            username: username,
            password: passphrase,
            port: 8080,
            tryKeyboard: true
        }

        await awaitFunction(cmd2, config2);

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

    public shouldExecute(context: IVirtualMachineWizardContext): boolean {
        return (context.image?.label == "Mariner 1.0");
    }
}
