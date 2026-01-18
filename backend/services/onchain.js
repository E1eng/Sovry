const { ethers } = require('ethers');

const config = require('../config/env');

let provider;

function getProvider() {
  if (!provider) {
    provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  }
  return provider;
}

module.exports = {
  getProvider,
};
