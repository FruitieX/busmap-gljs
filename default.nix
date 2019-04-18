with import <nixpkgs> {};
stdenv.mkDerivation rec {
  name = "busmap-gljs";
  env = buildEnv { name = name; paths = buildInputs; };
  buildInputs = [
    nodejs-11_x
    (yarn.override { nodejs = nodejs-11_x; })
  ];
}
