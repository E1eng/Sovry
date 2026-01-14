// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SovryToken
 * @author Sovry
 * @notice A mintable and burnable ERC-20 token that can function as a wrapper for another token
 * @dev This contract implements a standard ERC-20 token with minting, burning, and wrapper functionality.
 *      It inherits from OpenZeppelin's ERC20, ERC20Burnable, and Ownable contracts for security and standards compliance.
 */
contract SovryToken is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The underlying token that this contract wraps (can be address(0) if not used as wrapper)
    IERC20 public immutable underlyingToken;

    bool public publicWrappingEnabled;

    /// @notice Event emitted when tokens are minted
    /// @param to The address that received the minted tokens
    /// @param amount The amount of tokens minted
    event TokensMinted(address indexed to, uint256 amount);

    /// @notice Event emitted when tokens are burned
    /// @param from The address that burned the tokens
    /// @param amount The amount of tokens burned
    event TokensBurned(address indexed from, uint256 amount);

    /// @notice Event emitted when underlying tokens are deposited to mint wrapper tokens
    /// @param depositor The address that deposited the underlying tokens
    /// @param amount The amount of underlying tokens deposited
    /// @param wrapperTokensMinted The amount of wrapper tokens minted
    event TokensDeposited(address indexed depositor, uint256 amount, uint256 wrapperTokensMinted);

    /// @notice Event emitted when wrapper tokens are burned to withdraw underlying tokens
    /// @param withdrawer The address that withdrew the underlying tokens
    /// @param wrapperTokensBurned The amount of wrapper tokens burned
    /// @param underlyingTokensWithdrawn The amount of underlying tokens withdrawn
    event TokensWithdrawn(address indexed withdrawer, uint256 wrapperTokensBurned, uint256 underlyingTokensWithdrawn);

    /**
     * @notice Constructor that initializes the token
     * @param _name The name of the token
     * @param _symbol The symbol of the token
     * @param _underlyingToken The address of the underlying token to wrap (can be address(0) if not used as wrapper)
     * @param _initialOwner The address that will own the contract and have minting rights
     * @dev If _underlyingToken is address(0), the contract can still function as a regular mintable/burnable token
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _underlyingToken,
        address _initialOwner
    ) ERC20(_name, _symbol) Ownable(_initialOwner) {
        underlyingToken = IERC20(_underlyingToken);
        if (_underlyingToken != address(0)) {
            publicWrappingEnabled = true;
        }
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Mints new tokens to a specified address
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     * @dev Only the owner can call this function
     * @dev Emits a TokensMinted event
     */
    function mint(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "SovryToken: cannot mint to zero address");
        require(amount > 0, "SovryToken: amount must be greater than zero");
        
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @notice Burns tokens from the caller's balance
     * @param amount The amount of tokens to burn
     * @dev Any token holder can burn their own tokens
     * @dev Emits a TokensBurned event
     */
    function burn(uint256 amount) public override {
        require(amount > 0, "SovryToken: amount must be greater than zero");
        
        super.burn(amount);
        emit TokensBurned(msg.sender, amount);
    }

    /**
     * @notice Burns tokens from a specified address using allowance
     * @param from The address to burn tokens from
     * @param amount The amount of tokens to burn
     * @dev Requires that the caller has been approved to spend tokens from the 'from' address
     * @dev Emits a TokensBurned event
     */
    function burnFrom(address from, uint256 amount) public override {
        require(from != address(0), "SovryToken: cannot burn from zero address");
        require(amount > 0, "SovryToken: amount must be greater than zero");
        
        super.burnFrom(from, amount);
        emit TokensBurned(from, amount);
    }

    function setPublicWrapping(bool enabled) external onlyOwner {
        publicWrappingEnabled = enabled;
    }

    /**
     * @notice Deposits underlying tokens and mints wrapper tokens 1:1
     * @param amount The amount of underlying tokens to deposit
     * @dev Requires that the contract is configured as a wrapper (underlyingToken != address(0))
     * @dev Requires approval of underlying tokens to this contract
     * @dev Uses ReentrancyGuard to prevent reentrancy attacks
     * @dev Emits TokensDeposited and TokensMinted events
     */
    function deposit(uint256 amount) external nonReentrant {
        require(address(underlyingToken) != address(0), "SovryToken: not configured as wrapper");
        require(amount > 0, "SovryToken: amount must be greater than zero");
        require(publicWrappingEnabled, "SovryToken: public wrapping disabled");
        
        // Transfer underlying tokens from caller to this contract
        underlyingToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Mint wrapper tokens 1:1 to the caller
        _mint(msg.sender, amount);
        
        emit TokensDeposited(msg.sender, amount, amount);
        emit TokensMinted(msg.sender, amount);
    }

    /**
     * @notice Burns wrapper tokens and withdraws underlying tokens 1:1
     * @param amount The amount of wrapper tokens to burn (and underlying tokens to withdraw)
     * @dev Requires that the contract is configured as a wrapper (underlyingToken != address(0))
     * @dev Requires that the caller has sufficient wrapper token balance
     * @dev Uses ReentrancyGuard to prevent reentrancy attacks
     * @dev Emits TokensBurned and TokensWithdrawn events
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(address(underlyingToken) != address(0), "SovryToken: not configured as wrapper");
        require(amount > 0, "SovryToken: amount must be greater than zero");
        require(balanceOf(msg.sender) >= amount, "SovryToken: insufficient balance");
        
        // Burn wrapper tokens from caller
        _burn(msg.sender, amount);
        
        // Transfer underlying tokens from this contract to caller
        underlyingToken.safeTransfer(msg.sender, amount);
        
        emit TokensBurned(msg.sender, amount);
        emit TokensWithdrawn(msg.sender, amount, amount);
    }

    /**
     * @notice Returns the total amount of underlying tokens held by this contract
     * @return The balance of underlying tokens in this contract
     * @dev Only valid when used as a wrapper (underlyingToken != address(0))
     */
    function totalUnderlying() external view returns (uint256) {
        require(address(underlyingToken) != address(0), "SovryToken: not configured as wrapper");
        return underlyingToken.balanceOf(address(this));
    }

    /**
     * @notice Allows the owner to recover any ERC20 tokens accidentally sent to this contract
     * @param token The address of the token to recover
     * @param to The address to send the recovered tokens to
     * @param amount The amount of tokens to recover
     * @dev This should not be used to recover underlying tokens while the contract is active
     * @dev Only the owner can call this function
     */
    function recoverERC20(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "SovryToken: cannot recover to zero address");
        require(amount > 0, "SovryToken: amount must be greater than zero");
        
        IERC20(token).safeTransfer(to, amount);
    }
}
