#!/usr/bin/env Rscript
# Install the R packages listed in .devcontainer/r-requirements.txt.
# Run automatically by devcontainer.json (postCreateCommand); safe to re-run
# by hand:  Rscript .devcontainer/install-r-packages.R
#
# Uses pak (installed by the rocker r-packages feature) so prebuilt binaries
# are used where available and only packages without binaries are compiled.

req_file <- file.path(".devcontainer", "r-requirements.txt")
if (!file.exists(req_file))
  stop("Cannot find ", req_file, " — run from the repository root.")

pkgs <- readLines(req_file, warn = FALSE)
pkgs <- trimws(sub("#.*$", "", pkgs))      # strip comments
pkgs <- pkgs[nzchar(pkgs)]

if (!length(pkgs)) {
  message("No packages listed in ", req_file)
  quit(status = 0)
}

if (!requireNamespace("pak", quietly = TRUE))
  install.packages("pak", repos = "https://cloud.r-project.org")

# Compile one package at a time. Heavy C++ packages (glmmTMB) need several
# GB during compilation; parallel builds push a small Docker VM into OOM.
Sys.setenv(MAKEFLAGS = "-j1")

message("Installing R packages: ", paste(pkgs, collapse = ", "))
pak::pkg_install(pkgs, ask = FALSE)

missing <- pkgs[!vapply(sub("@.*$|.*/", "", pkgs), requireNamespace,
                        logical(1), quietly = TRUE)]
if (length(missing))
  stop("Failed to install: ", paste(missing, collapse = ", "))
message("All R packages installed.")
