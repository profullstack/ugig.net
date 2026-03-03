import ora from "ora";
import { createClient, handleError } from "../helpers.js";
import { printDetail } from "../output.js";
import { generateKeyPairSync } from "crypto";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58btcEncode(bytes) {
    let num = BigInt("0x" + Buffer.from(bytes).toString("hex"));
    const result = [];
    while (num > 0n) {
        const mod = Number(num % 58n);
        result.unshift(BASE58_ALPHABET[mod]);
        num = num / 58n;
    }
    for (const b of bytes) {
        if (b === 0)
            result.unshift("1");
        else
            break;
    }
    return result.join("");
}
function generateDid() {
    const { publicKey: pubKeyObj } = generateKeyPairSync("ed25519");
    const pubKeyRaw = pubKeyObj.export({ type: "spki", format: "der" }).subarray(-32);
    const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), pubKeyRaw]);
    const did = `did:key:z${base58btcEncode(multicodec)}`;
    const publicKey = Buffer.from(pubKeyRaw).toString("base64url");
    return { did, publicKey };
}
export function registerDidCommands(program) {
    const did = program
        .command("did")
        .description("Manage decentralized identifiers (DIDs)");
    did
        .command("generate")
        .description("Generate a new did:key (ed25519) without storing it")
        .action(async () => {
        const opts = program.opts();
        const { did, publicKey } = generateDid();
        if (opts.json) {
            console.log(JSON.stringify({ did, public_key: publicKey }, null, 2));
        }
        else {
            console.log(`DID:        ${did}`);
            console.log(`Public Key: ${publicKey}`);
        }
    });
    did
        .command("claim")
        .description("Generate a DID and store it on your profile")
        .option("--force", "Overwrite existing DID")
        .action(async (options) => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Claiming DID...").start();
        try {
            const client = createClient(opts);
            // Check if user already has a DID
            const profile = await client.get("/api/profile");
            if (profile.profile.did && !options.force) {
                spinner?.fail("You already have a DID");
                console.error(`Current DID: ${profile.profile.did}`);
                console.error("Use --force to overwrite.");
                process.exitCode = 1;
                return;
            }
            // Generate and store
            const { did: newDid, publicKey } = generateDid();
            // Update profile with DID
            const body = { ...profile.profile, did: newDid };
            await client.put("/api/profile", body);
            spinner?.succeed("DID claimed");
            printDetail([
                { label: "DID", key: "did" },
                { label: "Public Key", key: "public_key" },
            ], { did: newDid, public_key: publicKey }, opts);
        }
        catch (err) {
            spinner?.fail("Failed to claim DID");
            handleError(err, opts);
        }
    });
    did
        .command("show")
        .description("Show your current DID")
        .action(async () => {
        const opts = program.opts();
        const spinner = opts.json ? null : ora("Fetching DID...").start();
        try {
            const client = createClient(opts);
            const result = await client.get("/api/profile");
            spinner?.stop();
            const profileDid = result.profile.did;
            if (!profileDid) {
                if (opts.json) {
                    console.log(JSON.stringify({ did: null }, null, 2));
                }
                else {
                    console.log("No DID set. Run: ugig did claim");
                }
            }
            else {
                if (opts.json) {
                    console.log(JSON.stringify({ did: profileDid }, null, 2));
                }
                else {
                    console.log(`DID: ${profileDid}`);
                }
            }
        }
        catch (err) {
            spinner?.fail("Failed to fetch DID");
            handleError(err, opts);
        }
    });
}
//# sourceMappingURL=did.js.map