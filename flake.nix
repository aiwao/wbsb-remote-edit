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
        version = "0.1.0";
        # pnpm 10 reads this lockfile and avoids pnpm 11 fetcher instability on Darwin.
        pnpm = pkgs.pnpm_10;
        wbsbRemoteEdit = pkgs.buildGoModule {
          pname = "wbsb-remote-edit";
          inherit version;

          src = ./.;
          subPackages = [ "cmd/wbsb-remote-edit" ];
          vendorHash = "sha256-Xc/DatYTV+UumDZQ9Nq2H0QItXPgmzSHvYOWvR5lqBE=";
        };
        wbsbRemoteEditExtension = pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
          pname = "wbsb-remote-edit-extension";
          inherit version;

          src = ./extension;
          __structuredAttrs = true;
          strictDeps = true;

          nativeBuildInputs = [
            pkgs.nodejs_latest
            pnpm
            pkgs.pnpmConfigHook
          ];

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            inherit pnpm;
            fetcherVersion = 3;
            prePnpmInstall = ''
              pnpm config set network-concurrency 1
            '';
            hash = "sha256-2SS7x/BUaRToubrMUxbZl22mi6f1Cz9JsTMXiqE/XxA=";
          };

          env.WBSB_REMOTE_EDIT_VERSION = version;

          buildPhase = ''
            runHook preBuild
            pnpm run build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out
            cp -R dist/. $out/
            runHook postInstall
          '';
        });
        wbsbRemoteEditBuild = pkgs.runCommand "wbsb-remote-edit-build-${version}" { } ''
          mkdir -p $out/bin $out/extension
          ln -s ${wbsbRemoteEdit}/bin/wbsb-remote-edit $out/bin/wbsb-remote-edit
          cp -R ${wbsbRemoteEditExtension}/. $out/extension/
        '';
        versionCommand = pkgs.writeShellApplication {
          name = "wbsb-remote-edit-version";
          text = ''
            printf '%s' '${version}'
          '';
        };
      in
      {
        packages = {
          wbsb-remote-edit = wbsbRemoteEdit;
          wbsb-remote-edit-extension = wbsbRemoteEditExtension;
          default = wbsbRemoteEditBuild;
        };

        apps.version = {
          type = "app";
          program = "${versionCommand}/bin/wbsb-remote-edit-version";
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
