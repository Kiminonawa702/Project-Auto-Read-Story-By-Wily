const {
  default: WAConnect,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  Browsers, 
  fetchLatestWaWebVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const readline = require('readline');
const { Boom } = require("@hapi/boom");
const settings = require('./settings.js'); // Import settings

const emojis = require('./KumpulanEmot.js'); // Import emojis dari KumpulanEmot.js

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));
const store = makeInMemoryStore({ logger: pino().child({ level: "silent", stream: "store" }) });

// Fungsi untuk mencetak garis pemisah panjang
function printCoolLine() {
  console.log('='.repeat(50));
}

function printCoolText() {
  printCoolLine();
  console.log('==================================================');
  console.log('=================== Wily Kun =====================');
  console.log('==================================================');
  printCoolLine();
}

async function WAStart() {
  printCoolText(); // Cetak teks keren saat bot dijalankan

  const { state, saveCreds } = await useMultiFileAuthState("./sesi");
  const { version, isLatest } = await fetchLatestWaWebVersion().catch(() => fetchLatestBaileysVersion());
  console.log(`Using WA v${version.join(".")}, isLatest: ${isLatest}`);

  // Prompt pengguna untuk memilih antara Pairing Code dan QR Code
  printCoolLine();
  const choice = await question('Pilih metode autentikasi:\n1. Pairing Code\n2. QR Code\nMasukkan pilihan (1 atau 2): ');
  printCoolLine();

  let printQRInTerminal = true;
  if (choice.trim() === '1') {
    printQRInTerminal = false;
  } else if (choice.trim() !== '2') {
    console.log('Pilihan tidak valid. Keluar...');
    process.exit(1);
  }

  const client = WAConnect({
    logger: pino({ level: "silent" }),
    printQRInTerminal: printQRInTerminal,
    browser: Browsers.ubuntu("Chrome"),
    auth: state,
  });

  store.bind(client.ev);

  if (printQRInTerminal === false && !client.authState.creds.registered) {
    const phoneNumber = await question('Silahkan masukkan nomor Whatsapp kamu: ');
    let code = await client.requestPairingCode(phoneNumber);
    code = code?.match(/.{1,4}/g)?.join("-") || code;
    printCoolLine();
    console.log('⚠︎ Kode Pairing Whatsapp kamu: ' + code);
    console.log('⚠︎ Kode pairing akan diganti dengan yang baru. Harap segera memasukkan kode ke perangkat tertautan.');
    
    // Tambahkan tutorial cara memasukkan kode pairing ke perangkat WhatsApp
    printCoolLine();
    console.log('🚀 Cara Memasukkan Kode Pairing ke Perangkat WhatsApp:');
    console.log('1. 📱 Buka aplikasi WhatsApp di perangkat yang ingin dihubungkan.');
    console.log('2. ⚙️ Buka menu Pengaturan di WhatsApp.');
    console.log('3. 🔗 Pilih "Perangkat Tertaut".');
    console.log('4. 📋 Pilih "Tautkan Perangkat" dan masukkan kode pairing yang ditampilkan.');
    console.log('5. ⏳ Tunggu hingga proses pairing selesai.');
    printCoolLine();
  }

  client.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      const m = chatUpdate.messages[0];
      if (!m.message) return;
      
      const maxTime = settings.maxTime; // Gunakan nilai maxTime dari settings

      if (m.key && !m.key.fromMe && m.key.remoteJid === 'status@broadcast') {
        if (!m.message.reactionMessage) {
          const allowedSenders = [
            "6281447345627@s.whatsapp.net",
            "628145563553@s.whatsapp.net",
          ];

          if (!allowedSenders.includes(m.key.participant)) {
            const currentTime = Date.now();
            const messageTime = m.messageTimestamp * 1000;
            const timeDiff = currentTime - messageTime;

            if (timeDiff <= maxTime) {
              function getRandomEmoji() {
                const randomIndex = Math.floor(Math.random() * emojis.length);
                return emojis[randomIndex];
              }

              const randomEmoji = getRandomEmoji();
              try {
                await client.sendMessage("status@broadcast", {
                  react: { text: randomEmoji, key: m.key },
                }, { statusJidList: [m.key.participant] });

                await client.readMessages([m.key]);
                console.log(`Berhasil melihat status dari ${m.pushName}`);
              } catch (error) {
                console.error('Error', error);
              }
            }
          }
        }
      }
    } catch (err) {
      console.log(err);
    }
  });
  
  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (reason === DisconnectReason.badSession) {
        console.log(`Bad Session File, Please Delete Session and Scan Again`);
        process.exit();
      } else if (reason === DisconnectReason.connectionClosed) {
        console.log("Connection closed, reconnecting....");
        WAStart();
      } else if (reason === DisconnectReason.connectionLost) {
        console.log("Connection Lost from Server, reconnecting...");
        WAStart();
      } else if (reason === DisconnectReason.connectionReplaced) {
        console.log("Connection Replaced, Another New Session Opened, Please Restart Bot");
        process.exit();
      } else if (reason === DisconnectReason.loggedOut) {
        console.log(`Device Logged Out, Please Delete Folder Session and Scan Again.`);
        process.exit();
      } else if (reason === DisconnectReason.restartRequired) {
        console.log("Restart Required, Restarting...");
        WAStart();
      } else if (reason === DisconnectReason.timedOut) {
        console.log("Connection TimedOut, Reconnecting...");
        WAStart();
      } else {
        console.log(`Unknown DisconnectReason: ${reason}|${connection}`);
        WAStart();
      }
    } else if (connection === "open") {
      console.log("Connected to Readsw");
    }
  });

  client.ev.on("creds.update", saveCreds);

  return client;
}

WAStart();
