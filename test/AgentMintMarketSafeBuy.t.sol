// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {AgentMintGarden} from "../src/AgentMintGarden.sol";
import {AgentMintMarket} from "../src/AgentMintMarket.sol";

/// @dev A contract buyer that does not implement the ERC-721 receiver hook.
contract PlainBuyer {
    function attemptBuy(AgentMintMarket market, uint256 tokenId) external payable {
        market.buy{value: msg.value}(tokenId);
    }

    receive() external payable {}
}

/// @dev A contract buyer that does implement the hook.
contract ReceiverBuyer is IERC721Receiver {
    function attemptBuy(AgentMintMarket market, uint256 tokenId) external payable {
        market.buy{value: msg.value}(tokenId);
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}

/// @dev A contract buyer that answers the hook with the wrong selector.
contract WrongSelectorBuyer is IERC721Receiver {
    function attemptBuy(AgentMintMarket market, uint256 tokenId) external payable {
        market.buy{value: msg.value}(tokenId);
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0xdeadbeef;
    }

    receive() external payable {}
}

/// @notice A purchase must never park a token in a contract that cannot handle it.
contract AgentMintMarketSafeBuyTest is Test {
    uint256 internal constant ASK = 0.002 ether;

    AgentMintGarden internal garden;
    AgentMintMarket internal market;

    address internal owner = makeAddr("owner");
    address internal seller = makeAddr("seller");

    function setUp() public {
        garden = new AgentMintGarden(owner, 0.001 ether);
        market = new AgentMintMarket(address(garden));

        vm.prank(seller);
        garden.mint(2); // tokens 1 and 2, free phase

        vm.prank(seller);
        garden.approve(address(market), 1);

        vm.prank(seller);
        market.list(1, ASK);
    }

    function test_RevertWhenBuyerCannotReceiveErc721() public {
        PlainBuyer buyer = new PlainBuyer();
        vm.deal(address(buyer), 1 ether);

        vm.expectRevert(AgentMintMarket.MarketTransferFailed.selector);
        buyer.attemptBuy{value: ASK}(market, 1);

        assertEq(garden.ownerOf(1), seller, "token must stay with the seller");
        assertEq(address(market).balance, 0, "market must not hold funds");
    }

    function test_RevertWhenBuyerAnswersWithTheWrongSelector() public {
        WrongSelectorBuyer buyer = new WrongSelectorBuyer();
        vm.deal(address(buyer), 1 ether);

        vm.expectRevert(AgentMintMarket.MarketTransferFailed.selector);
        buyer.attemptBuy{value: ASK}(market, 1);

        assertEq(garden.ownerOf(1), seller);
    }

    function test_ContractBuyerWithTheHookCanBuy() public {
        ReceiverBuyer buyer = new ReceiverBuyer();
        vm.deal(address(buyer), 1 ether);
        uint256 sellerBefore = seller.balance;

        buyer.attemptBuy{value: ASK}(market, 1);

        assertEq(garden.ownerOf(1), address(buyer));
        assertEq(seller.balance, sellerBefore + ASK);
    }

    function test_EoaBuyerStillWorks() public {
        address bob = makeAddr("bob");
        vm.deal(bob, 1 ether);

        vm.prank(bob);
        market.buy{value: ASK}(1);

        assertEq(garden.ownerOf(1), bob);
    }
}
