// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AgentMintGarden} from "../src/AgentMintGarden.sol";
import {AgentMintMarket} from "../src/AgentMintMarket.sol";

contract AgentMintMarketTest is Test {
    uint256 internal constant MINT_PRICE = 0.001 ether;
    uint256 internal constant ASK = 0.002 ether;

    AgentMintGarden internal garden;
    AgentMintMarket internal market;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        garden = new AgentMintGarden(owner, MINT_PRICE);
        market = new AgentMintMarket(address(garden));

        vm.prank(alice);
        garden.mint(2); // tokens 1 and 2, free phase

        vm.deal(bob, 10 ether);
        vm.deal(alice, 10 ether); // so a self-purchase attempt reaches the contract
    }

    function _approveTokenOne() internal {
        vm.prank(alice);
        garden.approve(address(market), 1);
    }

    function _listed() internal {
        _approveTokenOne();
        vm.prank(alice);
        market.list(1, ASK);
    }

    // ---------------------------------------------------------------- listing

    function test_ListStoresListingAndEmits() public {
        _approveTokenOne();

        vm.expectEmit(true, true, false, true, address(market));
        emit AgentMintMarket.Listed(1, alice, ASK);

        vm.prank(alice);
        market.list(1, ASK);

        (address seller, uint256 price) = market.listingOf(1);
        assertEq(seller, alice);
        assertEq(price, ASK);
    }

    function test_RevertWhenListingSomeoneElsesToken() public {
        _approveTokenOne();

        vm.expectRevert(AgentMintMarket.MarketNotOwner.selector);
        vm.prank(bob);
        market.list(1, ASK);
    }

    function test_RevertWhenListingWithoutApproval() public {
        vm.expectRevert(AgentMintMarket.MarketNotApproved.selector);
        vm.prank(alice);
        market.list(1, ASK);
    }

    function test_ListAcceptsOperatorApproval() public {
        vm.prank(alice);
        garden.setApprovalForAll(address(market), true);

        vm.prank(alice);
        market.list(1, ASK);

        (address seller,) = market.listingOf(1);
        assertEq(seller, alice);
    }

    function test_RevertWhenPriceIsZero() public {
        _approveTokenOne();

        vm.expectRevert(AgentMintMarket.MarketZeroPrice.selector);
        vm.prank(alice);
        market.list(1, 0);
    }

    function test_RevertWhenListingTwice() public {
        _listed();

        vm.expectRevert(AgentMintMarket.MarketAlreadyListed.selector);
        vm.prank(alice);
        market.list(1, ASK);
    }

    // ---------------------------------------------------------------- buying

    function test_BuyTransfersTokenAndPaysSeller() public {
        _listed();
        uint256 sellerBefore = alice.balance;

        vm.expectEmit(true, true, true, true, address(market));
        emit AgentMintMarket.Sold(1, alice, bob, ASK);

        vm.prank(bob);
        market.buy{value: ASK}(1);

        assertEq(garden.ownerOf(1), bob);
        assertEq(alice.balance, sellerBefore + ASK);
        assertEq(address(market).balance, 0, "market must not retain funds");

        (address seller,) = market.listingOf(1);
        assertEq(seller, address(0), "listing must be cleared");
    }

    function test_RevertWhenUnderpaying() public {
        _listed();

        vm.expectRevert(
            abi.encodeWithSelector(AgentMintMarket.MarketIncorrectPayment.selector, ASK, ASK - 1)
        );
        vm.prank(bob);
        market.buy{value: ASK - 1}(1);
    }

    function test_RevertWhenOverpaying() public {
        _listed();

        vm.expectRevert(
            abi.encodeWithSelector(AgentMintMarket.MarketIncorrectPayment.selector, ASK, ASK + 1)
        );
        vm.prank(bob);
        market.buy{value: ASK + 1}(1);
    }

    function test_RevertWhenSellerBuysOwnToken() public {
        _listed();

        vm.expectRevert(AgentMintMarket.MarketSelfPurchase.selector);
        vm.prank(alice);
        market.buy{value: ASK}(1);
    }

    function test_RevertWhenTokenIsNotListed() public {
        vm.expectRevert(AgentMintMarket.MarketNotListed.selector);
        vm.prank(bob);
        market.buy{value: ASK}(2);
    }

    function test_RevertWhenSellerMovedTokenAway() public {
        _listed();

        vm.prank(alice);
        garden.transferFrom(alice, bob, 1);

        vm.expectRevert(AgentMintMarket.MarketStaleListing.selector);
        vm.prank(bob);
        market.buy{value: ASK}(1);
    }

    // ---------------------------------------------------------------- price and cancel

    function test_SellerCanUpdatePrice() public {
        _listed();

        vm.expectEmit(true, true, false, true, address(market));
        emit AgentMintMarket.PriceUpdated(1, alice, ASK * 2);

        vm.prank(alice);
        market.updatePrice(1, ASK * 2);

        (, uint256 price) = market.listingOf(1);
        assertEq(price, ASK * 2);
    }

    function test_RevertWhenStrangerUpdatesPrice() public {
        _listed();

        vm.expectRevert(AgentMintMarket.MarketNotSeller.selector);
        vm.prank(bob);
        market.updatePrice(1, ASK * 2);
    }

    function test_SellerCanCancel() public {
        _listed();

        vm.expectEmit(true, true, false, true, address(market));
        emit AgentMintMarket.Cancelled(1, alice);

        vm.prank(alice);
        market.cancel(1);

        (address seller,) = market.listingOf(1);
        assertEq(seller, address(0));

        vm.expectRevert(AgentMintMarket.MarketNotListed.selector);
        vm.prank(bob);
        market.buy{value: ASK}(1);
    }

    function test_RevertWhenStrangerCancels() public {
        _listed();

        vm.expectRevert(AgentMintMarket.MarketNotSeller.selector);
        vm.prank(bob);
        market.cancel(1);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_BuyRequiresTheExactPrice(uint96 rawValue) public {
        _listed();
        uint256 value = bound(uint256(rawValue), 0, 5 ether);

        if (value == ASK) {
            vm.prank(bob);
            market.buy{value: ASK}(1);
            assertEq(garden.ownerOf(1), bob);
            return;
        }

        vm.expectRevert(
            abi.encodeWithSelector(AgentMintMarket.MarketIncorrectPayment.selector, ASK, value)
        );
        vm.prank(bob);
        market.buy{value: value}(1);
    }

    function testFuzz_PriceIsStored(uint96 rawPrice) public {
        uint256 price = bound(uint256(rawPrice), 1, type(uint96).max);
        _approveTokenOne();

        vm.prank(alice);
        market.list(1, price);

        (, uint256 stored) = market.listingOf(1);
        assertEq(stored, price);
    }
}
