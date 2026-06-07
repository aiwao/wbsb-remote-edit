{
  description = "flake";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    systems.url = "github:nix-systems/default";
    flake-utils = {
      url = "github:numtide/flake-utils";
      inputs.systems.follows = "systems";
    };
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        wbsbRemoteEdit = pkgs.buildGoModule {
          pname = "wbsb-remote-edit";
          version = "0.1.0";

          src = ./.;
          subPackages = [ "cmd/wbsb-remote-edit" ];
          vendorHash = "sha256-Xc/DatYTV+UumDZQ9Nq2H0QItXPgmzSHvYOWvR5lqBE=";
        };
      in
      {
        packages = {
          wbsb-remote-edit = wbsbRemoteEdit;
          default = wbsbRemoteEdit;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            go
            gofumpt
            golangci-lint
            gotests
            gopls
            gotools

            nodejs_latest
            pnpm
            vscode-langservers-extracted
            vscode-css-languageserver
            web-ext
          ];
        };
      }
    );
}
