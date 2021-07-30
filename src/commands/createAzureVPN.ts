/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { IActionContext } from 'vscode-azureextensionui';
import { ext } from '../extensionVariables';
import { VirtualMachineTreeItem } from '../tree/VirtualMachineTreeItem';



export async function createAzureVPN(context: IActionContext, node?: VirtualMachineTreeItem): Promise<void> {
    if (!node) {
        node = await ext.tree.showTreeItemPicker<VirtualMachineTreeItem>(VirtualMachineTreeItem.linuxContextValue, context);
    }

    const privateIP: string = await node.getPrivateIpAddress();
    ext.outputChannel.appendLog(privateIP);

    // Create and show a new webview
    const panel = vscode.window.createWebviewPanel(
        'createAzureVPN', // Identifies the type of the webview. Used internally
        'Set up Point-to-Site VPN', // Title of the panel displayed to the user
        vscode.ViewColumn.One, // Editor column to show the new webview panel in.
        {
            enableScripts: true
        } // Webview options.
    );
    panel.webview.html = getWebviewContent();

    await vscode.env.openExternal(vscode.Uri.parse('https://msazure.visualstudio.com/AzureWiki/_wiki/wikis/AzureWiki.wiki/85898/Azure-Point-To-Site-VPN'));

    // https://docs.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-howto-point-to-site-resource-manager-portal#prerequisites
    // https://docs.microsoft.com/en-us/azure/vpn-gateway/point-to-site-vpn-client-configuration-azure-cert#generate
}

function getWebviewContent() {
    return `<!DOCTYPE html>
    <html lang="en">
    <title>Set up Point-to-Site VPN</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://www.w3schools.com/w3css/4/w3.css">
    <link rel="stylesheet" href="https://www.w3schools.com/lib/w3-theme-black.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
    <style>
    html,body{
        margin-left: 15px;
        margin-right: 15px;
    },h1,h2,h3,h4,h5,h6 {font-family: "Roboto", sans-serif;}
    </style>
    <body>

    <header>
        <div class="w3-center">
            <h1 class="w3-xxlarge">Set up Point-to-Site VPN</h1>
            <hr size="1" width="100%" color="#CCC">
        </div>
    </header>

    <div class="w3-main">
      <div class="w3-row">
          <h2 class="w3-text-teal">Useful Links</h2>
          <ol>
            <li><a href="https://msazure.visualstudio.com/AzureWiki/_wiki/wikis/AzureWiki.wiki/85898/Azure-Point-To-Site-VPN">AzureWiki: Azure Point To Site VPN</a></li>
            <li><a href="https://docs.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-howto-point-to-site-resource-manager-portal#prerequisites">Configure a Point-to-Site VPN connection using Azure certificate authentication: Azure portal</a></li>
            <li><a href="https://docs.microsoft.com/en-us/azure/vpn-gateway/point-to-site-vpn-client-configuration-azure-cert#generate">Generate and install VPN client configuration files for P2S certificate authentication</a></li>
          </ol>
      </div>

      <div class="w3-row w3-padding-32">
          <h2 class="w3-text-teal">Steps</h2>
          <ol>
            <li>Virtual Network and Virtual Network Gateway Setup</li>
            <li>Point-to-site Configuration on Gateway
                <ul>
                    <li>Azure Active Directory Authentication Setup</li>
                    <li>Certificate Authentication Setup</li>
                </ul>
            </li>
            <li>Client Setup
            <ul>
                    <li>Windows Client (AAD Authentication) Setup</li>
                    <li>Windows Client (Certificate Authentication) Setup</li>
                    <li>OS X Client (Certificate Authentication) Setup</li>
                    <li>Linux Client (Certificate Authentication) Setup </li>
                </ul>
            </li>
            <p>When uploading certificate to Azure as part of the <a href="https://docs.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-howto-point-to-site-resource-manager-portal">P2S configuration step</a>, select appropriate tunnel type</p>
          </ol>
      </div>
    </div>

    </body>
    </html>`;
}

