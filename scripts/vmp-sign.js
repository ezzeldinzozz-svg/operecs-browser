'use strict';

// castlabs VMP signature ("Verified Media Path"). Widevine only plays production streams (Netflix,
// Disney+, Prime Video…) in an app that carries it. It comes from castlabs' free signing service,
// EVS, which needs a one-time account on the build machine:
//
//   python3 -m pip install --upgrade castlabs-evs
//   python3 -m castlabs_evs.account signup      (or: … account reauth, when it has expired)
//
// Runs from the afterPack hook: after the fuses are flipped (changing the binary afterwards
// would break the signature) and, on macOS, before code signing. Only castlabs' Electron
// (version "…+wvcus") is signed; with plain Electron there is no DRM and nothing to do.
// Without EVS a build still works, but services that require VMP (Netflix…) refuse to play; the
// release script prints a warning.

const { execFileSync } = require('child_process');
const path = require('path');

const isCastlabs = () => /\+wvcus$/.test(require('electron/package.json').version);

function evsAvailable() {
  try {
    execFileSync('python3', ['-m', 'castlabs_evs.vmp', '--help'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

exports.signVmp = function signVmp(context) {
  if (!isCastlabs()) return 'not-needed';
  if (context.electronPlatformName === 'linux') return 'not-needed'; // Linux has no VMP
  if (!evsAvailable()) {
    console.warn('  • castlabs EVS not set up: no VMP signature, protected streams like Netflix won\'t play (see scripts/vmp-sign.js)');
    return 'missing';
  }
  execFileSync('python3', ['-m', 'castlabs_evs.vmp', 'sign-pkg', context.appOutDir], { stdio: 'inherit' });
  execFileSync('python3', ['-m', 'castlabs_evs.vmp', 'verify-pkg', context.appOutDir], { stdio: 'inherit' });
  console.log(`  • VMP-signed ${path.basename(context.appOutDir)}`);
  return 'signed';
};
exports.isCastlabs = isCastlabs;
