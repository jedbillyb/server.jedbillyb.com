import net from 'net';




function writeVarInt(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buf, offset) {
  let value = 0, size = 0, b;
  do {
    if (offset + size >= buf.length) return null; 
    b = buf[offset + size];
    value |= (b & 0x7f) << (7 * size);
    size++;
    if (size > 5) throw new Error('VarInt too big');
  } while (b & 0x80);
  return { value, size };
}

function packet(...buffers) {
  const body = Buffer.concat(buffers);
  return Buffer.concat([writeVarInt(body.length), body]);
}

export function mcPing(host, port = 25565, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let chunks = Buffer.alloc(0);
    let settled = false;

    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(arg);
    };

    socket.setTimeout(timeout);
    socket.on('timeout', () => done(reject, new Error('ping timeout')));
    socket.on('error', err => done(reject, err));

    socket.on('connect', () => {
      const addr = Buffer.from(host, 'utf8');
      const handshake = packet(
        writeVarInt(0x00),                 
        writeVarInt(47),                   
        writeVarInt(addr.length), addr,    
        Buffer.from([(port >> 8) & 0xff, port & 0xff]), 
        writeVarInt(0x01),                 
      );
      socket.write(handshake);
      socket.write(packet(writeVarInt(0x00))); 
    });

    socket.on('data', data => {
      chunks = Buffer.concat([chunks, data]);
      const lenHeader = readVarInt(chunks, 0);
      if (!lenHeader) return;
      const total = lenHeader.size + lenHeader.value;
      if (chunks.length < total) return; 

      let off = lenHeader.size;
      const pid = readVarInt(chunks, off); off += pid.size;       
      const strLen = readVarInt(chunks, off); off += strLen.size; 
      const json = chunks.slice(off, off + strLen.value).toString('utf8');

      try {
        const data = JSON.parse(json);
        const motd = typeof data.description === 'string'
          ? data.description
          : (data.description?.text ?? '');
        done(resolve, {
          online: data.players?.online ?? null,
          max: data.players?.max ?? null,
          version: data.version?.name ?? null,
          motd,
        });
      } catch (err) {
        done(reject, err);
      }
    });
  });
}
