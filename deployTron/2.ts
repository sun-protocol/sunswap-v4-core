module.exports = async ({
  getNamedAccounts,
  deployments,
  getChainId,
  getUnnamedAccounts,
}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  // the following will only deploy "GenericMetaTxProcessor" if the contract was never deployed or if the code changed since last deployment
  const res = await deploy('Lock2', {
    from: deployer,
    gasLimit: 4000000,
    args: [1893456000],
    tags: 'lumi2',
  });
  console.log(res)
};


module.exports.tags = ['lumi2'];
