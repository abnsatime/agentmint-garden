// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AgentMintGarden} from "../src/AgentMintGarden.sol";

contract AgentMintGardenHarness is AgentMintGarden {
    constructor(address initialOwner, uint256 paidMintPrice)
        AgentMintGarden(initialOwner, paidMintPrice)
    {}

    function setNextTokenId(uint256 tokenId) external {
        _nextTokenId = tokenId;
    }
}

contract AgentMintGardenTest is Test {
    uint256 internal constant PRICE = 0.001 ether;

    AgentMintGardenHarness internal garden;
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal treasury = makeAddr("treasury");

    function setUp() public {
        garden = new AgentMintGardenHarness(owner, PRICE);
        vm.deal(alice, 10 ether);
    }

    function test_ConfigurationAndMetadata() public view {
        assertEq(garden.name(), "AgentMint Garden");
        assertEq(garden.symbol(), "GARDEN");
        assertEq(garden.MAX_SUPPLY(), 2_000);
        assertEq(garden.FREE_SUPPLY(), 1_000);
        assertEq(garden.MAX_PER_WALLET(), 2);
        assertEq(garden.mintPrice(), PRICE);
        assertEq(garden.owner(), owner);
        assertEq(garden.totalSupply(), 0);
    }

    function test_FirstThousandTokensAreFree() public {
        garden.setNextTokenId(1_000);

        vm.prank(alice);
        garden.mint(1);

        assertEq(garden.ownerOf(1_000), alice);
        assertEq(garden.quoteMintPrice(1), PRICE);
    }

    function test_CrossingFreeBoundaryChargesOnlyPaidTokens() public {
        garden.setNextTokenId(1_000);

        vm.prank(alice);
        garden.mint{value: PRICE}(2);

        assertEq(garden.ownerOf(1_000), alice);
        assertEq(garden.ownerOf(1_001), alice);
        assertEq(address(garden).balance, PRICE);
        assertEq(garden.mintedBy(alice), 2);
    }

    function test_PaidMintRequiresExactPayment() public {
        garden.setNextTokenId(1_001);

        vm.expectRevert(
            abi.encodeWithSelector(
                AgentMintGarden.AgentMintGardenIncorrectPayment.selector, PRICE, 0
            )
        );
        vm.prank(alice);
        garden.mint(1);

        vm.prank(alice);
        garden.mint{value: PRICE}(1);
        assertEq(garden.ownerOf(1_001), alice);
    }

    function test_RevertWhenWalletExceedsTwoMints() public {
        vm.prank(alice);
        garden.mint(2);

        vm.expectRevert(
            abi.encodeWithSelector(AgentMintGarden.AgentMintGardenWalletLimit.selector, 2, 1)
        );
        vm.prank(alice);
        garden.mint(1);
    }

    function test_RevertWhenSupplyIsExhausted() public {
        garden.setNextTokenId(2_001);

        vm.expectRevert(
            abi.encodeWithSelector(AgentMintGarden.AgentMintGardenMaxSupply.selector, 2_000, 1)
        );
        vm.prank(alice);
        garden.mint{value: PRICE}(1);
    }

    function test_OwnerCanPauseAndUnpause() public {
        vm.prank(owner);
        garden.pause();

        vm.expectRevert();
        vm.prank(alice);
        garden.mint(1);

        vm.prank(owner);
        garden.unpause();
        vm.prank(alice);
        garden.mint(1);
        assertEq(garden.ownerOf(1), alice);
    }

    function test_OwnerCanWithdrawProceeds() public {
        garden.setNextTokenId(1_001);
        vm.prank(alice);
        garden.mint{value: PRICE}(1);

        vm.prank(owner);
        garden.withdraw(payable(treasury));

        assertEq(treasury.balance, PRICE);
        assertEq(address(garden).balance, 0);
    }

    function test_RevertWhenNonOwnerWithdraws() public {
        vm.expectRevert();
        vm.prank(alice);
        garden.withdraw(payable(treasury));
    }

    function test_TokenUriIsOnchainData() public {
        vm.prank(alice);
        garden.mint(1);

        assertTrue(
            bytes(garden.tokenURI(1)).length > 100, "token URI should contain encoded metadata"
        );
        assertTrue(
            _startsWith(garden.tokenURI(1), "data:application/json;base64,"),
            "token URI should be a JSON data URI"
        );
    }

    function testFuzz_QuoteChargesOnlyTokensAfterFreeSupply(uint16 rawSupply, uint8 rawQuantity)
        public
    {
        uint256 supply = bound(uint256(rawSupply), 0, 1_999);
        uint256 quantity = bound(uint256(rawQuantity), 1, 2);
        garden.setNextTokenId(supply + 1);

        uint256 freeRemaining = supply < 1_000 ? 1_000 - supply : 0;
        uint256 expectedPaidQuantity = quantity > freeRemaining ? quantity - freeRemaining : 0;
        assertEq(garden.quoteMintPrice(quantity), expectedPaidQuantity * PRICE);
    }

    function _startsWith(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        if (valueBytes.length < prefixBytes.length) return false;
        for (uint256 i; i < prefixBytes.length; ++i) {
            if (valueBytes[i] != prefixBytes[i]) return false;
        }
        return true;
    }
}
