// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {AgentMintGarden} from "../src/AgentMintGarden.sol";

contract DeployAgentMintGarden is Script {
    function run() external returns (AgentMintGarden garden) {
        address owner = vm.envAddress("NFT_OWNER");
        uint256 paidMintPrice = vm.envUint("PAID_MINT_PRICE");

        vm.startBroadcast();
        garden = new AgentMintGarden(owner, paidMintPrice);
        vm.stopBroadcast();
    }
}
