export function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

export function findDecodedArg(args = [], name) {
  const row = args.find((item) => item?.[1]?.name === name);
  return row ? row[0] : null;
}

export function decodedParams(log) {
  return Object.fromEntries((log?.decoded?.parameters || []).map((parameter) => [parameter.name, parameter.value]));
}

export function eventsNamed(logs, name) {
  return (logs || []).filter((log) => String(log?.decoded?.method_call || "").startsWith(name + "("));
}

export function eventForToken(logs, name, ca) {
  return (
    eventsNamed(logs, name).find((log) => {
      const parameters = decodedParams(log);
      return [parameters.token, parameters.memecoin, parameters.launchToken].some(
        (value) => isAddress(value) && value.toLowerCase() === ca.toLowerCase()
      );
    }) || null
  );
}

// An indexed address argument is left-padded to a full 32-byte log topic.
export function addressTopic(address) {
  return isAddress(address) ? "0x" + String(address).toLowerCase().slice(2).padStart(64, "0") : null;
}

export function sameId(left, right) {
  try {
    return left != null && right != null && BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

// The zero address is a real answer, not a missing one: a Uniswap v4 pool declares it
// when the pool runs no hook. Treating it as an address to look up turns "there is no
// hook" into "the hook could not be read".
export function isZeroAddress(value) {
  return /^0x0{40}$/.test(String(value || ""));
}
