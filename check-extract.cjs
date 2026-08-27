const { execSync } = require('child_process');
try {
  console.log(execSync('7z --help').toString());
} catch(e) {
  console.log('no 7z');
}
try {
  console.log(execSync('unrar --help').toString());
} catch(e) {
  console.log('no unrar');
}
try {
  console.log(execSync('bsdtar --help').toString());
} catch(e) {
  console.log('no bsdtar');
}
