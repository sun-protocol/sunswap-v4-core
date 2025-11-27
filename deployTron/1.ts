module.exports = async ({
  getNamedAccounts,
  deployments,
  getChainId,
  getUnnamedAccounts,
}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  // the following will only deploy "GenericMetaTxProcessor" if the contract was never deployed or if the code changed since last deployment
  const res = await deploy('PoolManager', {
    from: deployer,
    gasLimit: 4000000,
    tags: 'lumi',
  });
  console.log(res)
};


module.exports.tags = ['lumi'];
