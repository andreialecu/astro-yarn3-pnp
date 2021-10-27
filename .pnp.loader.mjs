import fs from 'fs';
import moduleExports from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL, URL } from 'url';

var PathType;
(function(PathType2) {
  PathType2[PathType2["File"] = 0] = "File";
  PathType2[PathType2["Portable"] = 1] = "Portable";
  PathType2[PathType2["Native"] = 2] = "Native";
})(PathType || (PathType = {}));
const npath = Object.create(path);
const ppath = Object.create(path.posix);
npath.cwd = () => process.cwd();
ppath.cwd = () => toPortablePath(process.cwd());
ppath.resolve = (...segments) => {
  if (segments.length > 0 && ppath.isAbsolute(segments[0])) {
    return path.posix.resolve(...segments);
  } else {
    return path.posix.resolve(ppath.cwd(), ...segments);
  }
};
const contains = function(pathUtils, from, to) {
  from = pathUtils.normalize(from);
  to = pathUtils.normalize(to);
  if (from === to)
    return `.`;
  if (!from.endsWith(pathUtils.sep))
    from = from + pathUtils.sep;
  if (to.startsWith(from)) {
    return to.slice(from.length);
  } else {
    return null;
  }
};
npath.fromPortablePath = fromPortablePath;
npath.toPortablePath = toPortablePath;
npath.contains = (from, to) => contains(npath, from, to);
ppath.contains = (from, to) => contains(ppath, from, to);
const WINDOWS_PATH_REGEXP = /^([a-zA-Z]:.*)$/;
const UNC_WINDOWS_PATH_REGEXP = /^\\\\(\.\\)?(.*)$/;
const PORTABLE_PATH_REGEXP = /^\/([a-zA-Z]:.*)$/;
const UNC_PORTABLE_PATH_REGEXP = /^\/unc\/(\.dot\/)?(.*)$/;
function fromPortablePath(p) {
  if (process.platform !== `win32`)
    return p;
  let portablePathMatch, uncPortablePathMatch;
  if (portablePathMatch = p.match(PORTABLE_PATH_REGEXP))
    p = portablePathMatch[1];
  else if (uncPortablePathMatch = p.match(UNC_PORTABLE_PATH_REGEXP))
    p = `\\\\${uncPortablePathMatch[1] ? `.\\` : ``}${uncPortablePathMatch[2]}`;
  else
    return p;
  return p.replace(/\//g, `\\`);
}
function toPortablePath(p) {
  if (process.platform !== `win32`)
    return p;
  let windowsPathMatch, uncWindowsPathMatch;
  if (windowsPathMatch = p.match(WINDOWS_PATH_REGEXP))
    p = `/${windowsPathMatch[1]}`;
  else if (uncWindowsPathMatch = p.match(UNC_WINDOWS_PATH_REGEXP))
    p = `/unc/${uncWindowsPathMatch[1] ? `.dot/` : ``}${uncWindowsPathMatch[2]}`;
  return p.replace(/\\/g, `/`);
}

function readPackageScope(checkPath) {
  const rootSeparatorIndex = checkPath.indexOf(npath.sep);
  let separatorIndex;
  do {
    separatorIndex = checkPath.lastIndexOf(npath.sep);
    checkPath = checkPath.slice(0, separatorIndex);
    if (checkPath.endsWith(`${npath.sep}node_modules`))
      return false;
    const pjson = readPackage(checkPath + npath.sep);
    if (pjson) {
      return {
        data: pjson,
        path: checkPath
      };
    }
  } while (separatorIndex > rootSeparatorIndex);
  return false;
}
function readPackage(requestPath) {
  const jsonPath = npath.resolve(requestPath, `package.json`);
  if (!fs.existsSync(jsonPath))
    return null;
  return JSON.parse(fs.readFileSync(jsonPath, `utf8`));
}

function tryParseURL(str) {
  try {
    return new URL(str);
  } catch {
    return null;
  }
}
const builtins = new Set([...moduleExports.builtinModules]);
const pathRegExp = /^(?![a-zA-Z]:[\\/]|\\\\|\.{0,2}(?:\/|$))((?:node:)?(?:@[^/]+\/)?[^/]+)\/*(.*|)$/;
async function exists(path2) {
  try {
    await fs.promises.access(path2, fs.constants.R_OK);
    return true;
  } catch {
  }
  return false;
}
async function resolve(originalSpecifier, context, defaultResolver) {
  var _a;
  const {findPnpApi} = moduleExports;
  if (!findPnpApi || builtins.has(originalSpecifier))
    return defaultResolver(originalSpecifier, context, defaultResolver);
  let specifier = originalSpecifier;
  const url = tryParseURL(specifier);
  if (url) {
    if (url.protocol !== `file:`)
      return defaultResolver(originalSpecifier, context, defaultResolver);
    specifier = fileURLToPath(specifier);
  }
  const {parentURL, conditions = []} = context;
  const issuer = parentURL ? fileURLToPath(parentURL) : process.cwd();
  const pnpapi = (_a = findPnpApi(issuer)) != null ? _a : url ? findPnpApi(specifier) : null;
  if (!pnpapi)
    return defaultResolver(originalSpecifier, context, defaultResolver);
  const dependencyNameMatch = specifier.match(pathRegExp);
  let allowLegacyResolve = false;
  if (dependencyNameMatch) {
    const [, dependencyName, subPath] = dependencyNameMatch;
    if (subPath === ``) {
      const resolved = pnpapi.resolveToUnqualified(`${dependencyName}/package.json`, issuer);
      if (resolved && await exists(resolved)) {
        const pkg = JSON.parse(await fs.promises.readFile(resolved, `utf8`));
        allowLegacyResolve = pkg.exports == null;
      }
    }
  }
  const result = pnpapi.resolveRequest(specifier, issuer, {
    conditions: new Set(conditions),
    extensions: allowLegacyResolve ? void 0 : []
  });
  if (!result)
    throw new Error(`Resolving '${specifier}' from '${issuer}' failed`);
  return {
    url: pathToFileURL(result).href
  };
}
async function getFormat(resolved, context, defaultGetFormat) {
  var _a;
  const url = tryParseURL(resolved);
  if ((url == null ? void 0 : url.protocol) !== `file:`)
    return defaultGetFormat(resolved, context, defaultGetFormat);
  const ext = path.extname(url.pathname);
  switch (ext) {
    case `.mjs`: {
      return {
        format: `module`
      };
    }
    case `.cjs`: {
      return {
        format: `commonjs`
      };
    }
    case `.json`: {
      throw new Error(`Unknown file extension ".json" for ${fileURLToPath(resolved)}`);
    }
    case `.js`: {
      const pkg = readPackageScope(fileURLToPath(resolved));
      if (pkg) {
        return {
          format: (_a = pkg.data.type) != null ? _a : `commonjs`
        };
      }
    }
  }
  return defaultGetFormat(resolved, context, defaultGetFormat);
}
async function getSource(urlString, context, defaultGetSource) {
  const url = tryParseURL(urlString);
  if ((url == null ? void 0 : url.protocol) !== `file:`)
    return defaultGetSource(url, context, defaultGetSource);
  return {
    source: await fs.promises.readFile(fileURLToPath(urlString), `utf8`)
  };
}
const binding = process.binding(`fs`);
const originalfstat = binding.fstat;
const ZIP_FD = 2147483648;
binding.fstat = function(...args) {
  const [fd, useBigint, req] = args;
  if ((fd & ZIP_FD) !== 0 && useBigint === false && req === void 0) {
    try {
      const stats = fs.fstatSync(fd);
      return new Float64Array([
        stats.dev,
        stats.mode,
        stats.nlink,
        stats.uid,
        stats.gid,
        stats.rdev,
        stats.blksize,
        stats.ino,
        stats.size,
        stats.blocks
      ]);
    } catch {
    }
  }
  return originalfstat.apply(this, args);
};

export { getFormat, getSource, resolve };
