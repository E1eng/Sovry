import { ethers } from "hardhat";
import hre from "hardhat";

function buildTokenUri(metadata: Record<string, unknown>) {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata), "utf8").toString("base64")}`;
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Network:", hre.network.name);
  console.log("Signer:", signer.address);

  const IP_ASSET_REGISTRY = "0x77319B4031e6eF1250907aa00018B8B1c67a244b";
  const LICENSING_MODULE = "0x04fbd8a2e56dd85CFD5500A4A4DfA955B9f1dE6f";
  const PI_LICENSE_TEMPLATE = "0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316";
  const ROYALTY_MODULE = "0xD2f60c40fEbccf6311f8B47c4f2Ec6b040400086";
  const ROYALTY_POLICY_LAP = "0xBe54FB168b3c982b7AaE60dB6CF75Bd8447b390E";
  const WIP_TOKEN = "0x1514000000000000000000000000000000000000";

  const LICENSE_AMOUNT = 1;
  const MAX_MINTING_FEE = 0;
  const MAX_REVENUE_SHARE = 100_000_000;
  const ROYALTY_CONTEXT = "0x";

  const baseName = "Sovry Test IP";
  const baseDescription = "Sovry test IP for Story Protocol registration.";
  const defaultIpfsImage =
    "https://brown-labour-eagle-935.mypinata.cloud/ipfs/bafkreiahsncol4l3ore6dj2rac2onjyzjv24skpmexbfxfx7utq2v57gti";
  const image = process.env.TEST_IP_IMAGE || defaultIpfsImage;
  const externalUrl = "https://sovry.xyz";

  const ipAssetRegistry = await ethers.getContractAt(
    [
      "function getFeeToken() view returns (address)",
      "function getFeeAmount() view returns (uint96)",
    ],
    IP_ASSET_REGISTRY,
    signer
  );

  const feeToken: string = await ipAssetRegistry.getFeeToken();
  const feeAmount = await ipAssetRegistry.getFeeAmount();
  console.log("IPAssetRegistry feeToken:", feeToken);
  console.log("IPAssetRegistry feeAmount:", feeAmount.toString());

  if (feeToken !== ethers.constants.AddressZero && !feeAmount.isZero()) {
    const erc20 = await ethers.getContractAt(
      [
        "function approve(address spender,uint256 amount) returns (bool)",
        "function allowance(address owner,address spender) view returns (uint256)",
      ],
      feeToken,
      signer
    );

    const currentAllowance = await erc20.allowance(signer.address, IP_ASSET_REGISTRY);
    if (currentAllowance.lt(feeAmount)) {
      const approveTx = await erc20.approve(IP_ASSET_REGISTRY, feeAmount);
      const approveRc = await approveTx.wait();
      console.log("Approve feeToken tx:", approveRc.transactionHash);
    }
  }

  const Helper = await ethers.getContractFactory("StoryIpTestHelper");
  const helper = await Helper.deploy(IP_ASSET_REGISTRY, ROYALTY_MODULE);
  await helper.deployed();
  console.log("StoryIpTestHelper:", helper.address);

  const testNftAddress: string = await helper.testNft();
  const testNft = await ethers.getContractAt(
    [
      "function nextTokenId() view returns (uint256)",
      "function ownerOf(uint256) view returns (address)",
    ],
    testNftAddress,
    signer
  );

  const tokenId = await testNft.nextTokenId();

  const tokenUri = buildTokenUri({
    name: `${baseName} #${tokenId.toString()}`,
    description: baseDescription,
    image,
    external_url: externalUrl,
    attributes: [
      { trait_type: "Project", value: "Sovry" },
      { trait_type: "Network", value: hre.network.name },
      { trait_type: "ChainId", value: String(hre.network.config.chainId ?? "") },
    ],
  });

  const mintTx = await helper.mintAndRegisterIp(tokenUri);
  const mintRc = await mintTx.wait();

  const ipId: string = await helper.predictIpId(tokenId);

  console.log("Mint+Register tx:", mintRc.transactionHash);
  console.log("Test NFT:", testNftAddress);
  console.log("Token ID:", tokenId.toString());
  console.log("Token URI:", tokenUri);
  console.log("IP ID (IP Account):", ipId);
  console.log("NFT owner:", await testNft.ownerOf(tokenId));

  const pilTemplate = await ethers.getContractAt(
    [
      "function registerLicenseTerms((bool transferable,address royaltyPolicy,uint256 defaultMintingFee,uint256 expiration,bool commercialUse,bool commercialAttribution,address commercializerChecker,bytes commercializerCheckerData,uint32 commercialRevShare,uint256 commercialRevCeiling,bool derivativesAllowed,bool derivativesAttribution,bool derivativesApproval,bool derivativesReciprocal,uint256 derivativeRevCeiling,address currency,string uri)) returns (uint256)",
    ],
    PI_LICENSE_TEMPLATE,
    signer
  );

  const pilTerms = {
    transferable: false,
    royaltyPolicy: ROYALTY_POLICY_LAP,
    defaultMintingFee: 0,
    expiration: 0,
    commercialUse: true,
    commercialAttribution: true,
    commercializerChecker: ethers.constants.AddressZero,
    commercializerCheckerData: "0x",
    // 5% in Story's 100_000_000 = 100% scale
    commercialRevShare: 5_000_000,
    commercialRevCeiling: 0,
    derivativesAllowed: true,
    derivativesAttribution: true,
    derivativesApproval: false,
    derivativesReciprocal: false,
    derivativeRevCeiling: 0,
    currency: WIP_TOKEN,
    uri: "https://sovry.xyz/licenses/pil-commercial-v1",
  };

  const licenseTermsId = await pilTemplate.callStatic.registerLicenseTerms(pilTerms);
  const registerTermsTx = await pilTemplate.registerLicenseTerms(pilTerms);
  const registerTermsRc = await registerTermsTx.wait();
  console.log("Register PIL terms tx:", registerTermsRc.transactionHash);
  console.log("PIL licenseTermsId:", licenseTermsId.toString());

  const licensingModule = await ethers.getContractAt(
    [
      "function attachLicenseTerms(address ipId,address licenseTemplate,uint256 licenseTermsId)",
      "function predictMintingLicenseFee(address licensorIpId,address licenseTemplate,uint256 licenseTermsId,uint256 amount,address receiver,bytes royaltyContext) view returns (address currencyToken,uint256 tokenAmount)",
      "function mintLicenseTokens(address licensorIpId,address licenseTemplate,uint256 licenseTermsId,uint256 amount,address receiver,bytes royaltyContext,uint256 maxMintingFee,uint32 maxRevenueShare) returns (uint256 startLicenseTokenId)",
    ],
    LICENSING_MODULE,
    signer
  );

  try {
    const attachTx = await licensingModule.attachLicenseTerms(ipId, PI_LICENSE_TEMPLATE, licenseTermsId);
    const attachRc = await attachTx.wait();
    console.log("Attach license terms tx:", attachRc.transactionHash);
  } catch (error) {
    console.log("attachLicenseTerms reverted (continuing):", error);
  }

  const receiver = signer.address;
  const fee = await licensingModule.predictMintingLicenseFee(
    ipId,
    PI_LICENSE_TEMPLATE,
    licenseTermsId,
    LICENSE_AMOUNT,
    receiver,
    ROYALTY_CONTEXT
  );
  const feeCurrencyToken: string = fee.currencyToken;
  const feeTokenAmount = fee.tokenAmount;

  console.log("License mint fee currency:", feeCurrencyToken);
  console.log("License mint fee amount:", feeTokenAmount.toString());

  if (feeCurrencyToken !== ethers.constants.AddressZero && !feeTokenAmount.isZero()) {
    const feeErc20 = await ethers.getContractAt(
      [
        "function approve(address spender,uint256 amount) returns (bool)",
        "function allowance(address owner,address spender) view returns (uint256)",
      ],
      feeCurrencyToken,
      signer
    );
    const currentAllowance = await feeErc20.allowance(signer.address, LICENSING_MODULE);
    if (currentAllowance.lt(feeTokenAmount)) {
      const approveTx = await feeErc20.approve(LICENSING_MODULE, feeTokenAmount);
      const approveRc = await approveTx.wait();
      console.log("Approve mint fee tx:", approveRc.transactionHash);
    }
  }

  const mintLicenseTx = await licensingModule.mintLicenseTokens(
    ipId,
    PI_LICENSE_TEMPLATE,
    licenseTermsId,
    LICENSE_AMOUNT,
    receiver,
    ROYALTY_CONTEXT,
    MAX_MINTING_FEE,
    MAX_REVENUE_SHARE
  );
  const mintLicenseRc = await mintLicenseTx.wait();
  console.log("Mint license tx:", mintLicenseRc.transactionHash);

  const royaltyModule = await ethers.getContractAt(
    ["function ipRoyaltyVaults(address ipId) view returns (address)"],
    ROYALTY_MODULE,
    signer
  );

  let vault: string = ethers.constants.AddressZero;
  for (let attempt = 0; attempt < 20; attempt++) {
    vault = await royaltyModule.ipRoyaltyVaults(ipId);
    if (vault !== ethers.constants.AddressZero) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (vault === ethers.constants.AddressZero) {
    throw new Error("Royalty vault still zero after commercial license minting.");
  }

  console.log("Royalty vault:", vault);

  const rt = await ethers.getContractAt(
    [
      "function balanceOf(address owner) view returns (uint256)",
      "function totalSupply() view returns (uint256)",
      "function decimals() view returns (uint8)",
    ],
    vault,
    signer
  );
  console.log("Royalty token (RT) address:", vault);
  console.log("RT decimals:", await rt.decimals());
  console.log("RT totalSupply:", (await rt.totalSupply()).toString());
  console.log("Your RT balance:", (await rt.balanceOf(signer.address)).toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
