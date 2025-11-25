// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SovryToken
 * @author Sovry
 * @notice A standard ERC-20 token with minting, burning, and wrapper functionality
 * @dev This contract implements a mintable and burnable ERC-20 token that can wrap
 *      another ERC-20 token, allowing users to deposit underlying tokens and receive
 *      wrapped tokens, and withdraw underlying tokens by burning wrapped tokens.
 */
contract SovryToken is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The underlying token that this contract wraps
    IERC20 public immutable underlyingToken;

    /// @notice Event emitted when tokens are minted
    /// @param to The address that received the minted tokens
    /// @param amount The amount of tokens minted
    event TokensMinted(address indexed to, uint256 amount);

    /// @notice Event emitted when tokens are burned
    /// @param from The address that burned the tokens
    /// @param amount The amount of tokens burned
    event TokensBurned(address indexed from, uint256 amount);

    /// @notice Event emitted when underlying tokens are deposited
    /// @param user The address that deposited the underlying tokens
    /// @param amount The amount of underlying tokens deposited
    event Deposit(address indexed user, uint256 amount);

    /// @notice Event emitted when underlying tokens are withdrawn
    /// @param user The address that withdrew the underlying tokens
    /// @param amount The amount of underlying tokens withdrawn
    event Withdraw(address indexed user, uint256 amount);

    /**
     * @notice Constructor that initializes the token with name, symbol, and underlying token
     * @param _underlyingToken The address of the underlying ERC-20 token to wrap
     * @param _initialOwner The address that will own the contract (can mint tokens)
     */
    constructor(address _underlyingToken, address _initialOwner) ERC20("Sovry Token", "SOVRY") Ownable(_initialOwner) {
        require(_underlyingToken != address(0), "SovryToken: underlying token cannot be zero address");
        require(_initialOwner != address(0), "SovryToken: owner cannot be zero address");
        underlyingToken = IERC20(_underlyingToken);
    }

    /**
     * @notice Mints new tokens to the specified address
     * @dev Only the owner can mint new tokens. This function emits a TokensMinted event.
     * @param to The address to receive the minted tokens
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "SovryToken: cannot mint to zero address");
        require(amount > 0, "SovryToken: amount must be greater than zero");
        
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @notice Burns tokens from the caller's balance
     * @dev Any token holder can burn their own tokens. This function emits a TokensBurned event.
     * @param amount The amount of tokens to burn
     */
    function burn(uint256 amount) public override {
        address burner = msg.sender;
        super.burn(amount);
        emit TokensBurned(burner, amount);
    }

    /**
     * @notice Burns tokens from a specified address using allowance
     * @dev Burns tokens from `account` if the caller has sufficient allowance.
     *      This function emits a TokensBurned event.
     * @param account The address to burn tokens from
     * @param amount The amount of tokens to burn
     */
    function burnFrom(address account, uint256 amount) public override {
        super.burnFrom(account, amount);
        emit TokensBurned(account, amount);
    }

    /**
     * @notice Deposits underlying tokens and mints wrapped tokens
     * @dev Users deposit underlying tokens and receive an equivalent amount of wrapped tokens.
     *      Uses ReentrancyGuard to prevent reentrancy attacks.
     *      Follows Checks-Effects-Interactions pattern.
     * @param amount The amount of underlying tokens to deposit
     * @return The amount of wrapped tokens minted (1:1 ratio)
     */
    function deposit(uint256 amount) external nonReentrant returns (uint256) {
        require(amount > 0, "SovryToken: amount must be greater than zero");
        
        // Checks: Verify the user has sufficient balance and allowance
        require(
            underlyingToken.balanceOf(msg.sender) >= amount,
            "SovryToken: insufficient underlying token balance"
        );
        require(
            underlyingToken.allowance(msg.sender, address(this)) >= amount,
            "SovryToken: insufficient underlying token allowance"
        );

        // Effects: Transfer underlying tokens to this contract
        underlyingToken.safeTransferFrom(msg.sender, address(this), amount);

        // Interactions: Mint wrapped tokens to the user
        _mint(msg.sender, amount);
        
        emit Deposit(msg.sender, amount);
        emit TokensMinted(msg.sender, amount);
        
        return amount;
    }

    /**
     * @notice Withdraws underlying tokens by burning wrapped tokens
     * @dev Users burn wrapped tokens and receive an equivalent amount of underlying tokens.
     *      Uses ReentrancyGuard to prevent reentrancy attacks.
     *      Follows Checks-Effects-Interactions pattern.
     * @param amount The amount of wrapped tokens to burn (and underlying tokens to withdraw)
     * @return The amount of underlying tokens withdrawn
     */
    function withdraw(uint256 amount) external nonReentrant returns (uint256) {
        require(amount > 0, "SovryToken: amount must be greater than zero");
        require(
            balanceOf(msg.sender) >= amount,
            "SovryToken: insufficient wrapped token balance"
        );
        require(
            underlyingToken.balanceOf(address(this)) >= amount,
            "SovryToken: insufficient underlying token reserves"
        );

        // Effects: Burn wrapped tokens from the user
        _burn(msg.sender, amount);

        // Interactions: Transfer underlying tokens to the user
        underlyingToken.safeTransfer(msg.sender, amount);
        
        emit TokensBurned(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
        
        return amount;
    }

    /**
     * @notice Returns the amount of underlying tokens held by this contract
     * @return The balance of underlying tokens in this contract
     */
    function totalUnderlyingReserves() external view returns (uint256) {
        return underlyingToken.balanceOf(address(this));
    }

    /**
     * @notice Returns the exchange rate between wrapped tokens and underlying tokens
     * @dev Always returns 1e18 (1:1 ratio) since this is a simple wrapper
     * @return The exchange rate (1e18 = 1:1)
     */
    function exchangeRate() external pure returns (uint256) {
        return 1e18;
    }
}

