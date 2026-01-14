// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title BondingCurveLib
 * @notice Library for bonding curve calculations
 * @dev Used to reduce contract size by extracting curve calculations
 */
library BondingCurveLib {

    struct Curve {
        uint256 basePrice;
        uint256 priceIncrement;
        uint256 currentSupply;
        uint256 reserveBalance;
        bool isActive;
    }

    /**
     * @notice Calculate buy price using linear bonding curve
     * @param basePrice Base price for the curve
     * @param priceIncrement Price increment per token unit
     * @param currentSupply Current supply in curve
     * @param initialCurveSupply Initial curve supply
     * @param amount Amount of tokens to buy (in wrapper units)
     * @param wrapUnit Wrapper unit for normalization
     * @return totalCost Total cost including base and increment
     */
    function calculateBuyPrice(
        uint256 basePrice,
        uint256 priceIncrement,
        uint256 currentSupply,
        uint256 initialCurveSupply,
        uint256 amount,
        uint256 wrapUnit
    ) internal pure returns (uint256 totalCost) {
        // Calculate sold tokens
        uint256 soldRaw = initialCurveSupply > currentSupply
            ? (initialCurveSupply - currentSupply)
            : 0;
        
        uint256 soldUnits = soldRaw / wrapUnit;
        uint256 amountUnits = amount / wrapUnit;

        // Base cost: basePrice * amountUnits
        uint256 baseCost = basePrice * amountUnits;

        // Increment cost: priceIncrement * (soldUnits * amountUnits + amountUnits^2 / 2)
        uint256 term1 = priceIncrement * soldUnits * amountUnits;
        uint256 term2 = (priceIncrement * amountUnits * amountUnits) / 2;

        uint256 incrementCost = term1 + term2;
        totalCost = baseCost + incrementCost;
    }

    /**
     * @notice Calculate sell price using linear bonding curve
     * @param basePrice Base price for the curve
     * @param priceIncrement Price increment per token unit
     * @param currentSupply Current supply in curve
     * @param initialCurveSupply Initial curve supply
     * @param amount Amount of tokens to sell (in wrapper units)
     * @param wrapUnit Wrapper unit for normalization
     * @return totalProceeds Total proceeds before fees
     */
    function calculateSellPrice(
        uint256 basePrice,
        uint256 priceIncrement,
        uint256 currentSupply,
        uint256 initialCurveSupply,
        uint256 amount,
        uint256 wrapUnit
    ) internal pure returns (uint256 totalProceeds) {
        // Calculate sold tokens
        uint256 soldRaw = initialCurveSupply > currentSupply
            ? (initialCurveSupply - currentSupply)
            : 0;
        
        uint256 soldUnits = soldRaw / wrapUnit;
        uint256 amountUnits = amount / wrapUnit;

        // Base proceeds: basePrice * amountUnits
        uint256 baseProceeds = basePrice * amountUnits;

        // Increment proceeds: priceIncrement * (soldUnits * amountUnits - amountUnits^2 / 2)
        uint256 term1 = priceIncrement * soldUnits * amountUnits;
        uint256 term2 = (priceIncrement * amountUnits * amountUnits) / 2;

        uint256 incrementProceeds = term1 - term2;
        totalProceeds = baseProceeds + incrementProceeds;
    }

    /**
     * @notice Check if curve is active
     * @param curve The bonding curve data
     * @return isActive_ True if curve is active
     */
    function isActive(Curve memory curve) internal pure returns (bool isActive_) {
        isActive_ = curve.isActive;
    }

    /**
     * @notice Get current price for buying one token
     * @param curve The bonding curve data
     * @param wrapUnit Wrapper unit for normalization
     * @return price Current price per token
     */
    function getCurrentPrice(
        Curve memory curve,
        uint256 wrapUnit
    ) internal pure returns (uint256 price) {
        uint256 soldUnits = curve.currentSupply / wrapUnit;
        price = curve.basePrice + (soldUnits * curve.priceIncrement);
    }
}
