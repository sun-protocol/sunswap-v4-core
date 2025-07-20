module.exports = async ({
  getNamedAccounts,
  deployments,
  getChainId,
  getUnnamedAccounts,
}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  // the following will only deploy "GenericMetaTxProcessor" if the contract was never deployed or if the code changed since last deployment
  const res = await deploy('ProtocolFeeController', {
    from: deployer,
    gasLimit: 4000000,
    args: ['0xD033B0fD1B38D9a8f04a8C2Adc55b91c288930b1'],
    tags: 'lumi2',
  });
  console.log(res)
};


module.exports.tags = ['lumi2'];
