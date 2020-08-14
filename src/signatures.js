// signatures
const newAppInstanceSignature = 'newAppInstance(bytes32,address,bytes,bool)';
const createPermissionSignature =
    'createPermission(address,address,bytes32,address)';
const tokenManagerInitSignature = 'initialize(address,bool,uint256)';
const delayInitSignature = 'initialize(uint64)';
const tokenRequestInitSignature = 'initialize(address,address,address[])';
const redemptionsInitSignature = 'initialize(address,address,address[])';
const vaultInitSignature = 'initialize()';
const newTokenAndInstance =
    'newTokenAndInstance(string,string,string,address[],uint256[],uint64[3],uint64,bool)';

module.exports = {
    newAppInstanceSignature,
    createPermissionSignature,
    tokenManagerInitSignature,
    delayInitSignature,
    tokenRequestInitSignature,
    redemptionsInitSignature,
    vaultInitSignature,
    newTokenAndInstance
};
