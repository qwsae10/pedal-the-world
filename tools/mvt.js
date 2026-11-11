// Minimal Mapbox Vector Tile decoder: enough to read Mapillary coverage tiles
// (point and line features with their properties). No dependencies.

function reader(buf) {
  let pos = 0;
  const end = buf.length;
  const varint = () => {
    let result = 0, mul = 1, b;
    do {
      b = buf[pos++];
      result += (b & 0x7f) * mul;
      mul *= 128;
    } while (b >= 0x80);
    return result;
  };
  const self = {
    get pos() { return pos; },
    more: () => pos < end,
    varint,
    tag() { const t = varint(); return { field: Math.floor(t / 8), wire: t & 7 }; },
    bytes() { const n = varint(); const out = buf.subarray(pos, pos + n); pos += n; return out; },
    skip(wire) {
      if (wire === 0) varint();
      else if (wire === 1) pos += 8;
      else if (wire === 2) pos += varint();
      else if (wire === 5) pos += 4;
      else throw new Error('bad wire type ' + wire);
    },
    fixed32f() { const v = new DataView(buf.buffer, buf.byteOffset + pos, 4).getFloat32(0, true); pos += 4; return v; },
    fixed64f() { const v = new DataView(buf.buffer, buf.byteOffset + pos, 8).getFloat64(0, true); pos += 8; return v; },
  };
  return self;
}

const zigzag = (n) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);

function utf8(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function packed(bytes) {
  const r = reader(bytes);
  const out = [];
  while (r.more()) out.push(r.varint());
  return out;
}

function readValue(bytes) {
  const r = reader(bytes);
  let v = null;
  while (r.more()) {
    const { field, wire } = r.tag();
    if (field === 1) v = utf8(r.bytes());
    else if (field === 2) v = r.fixed32f();
    else if (field === 3) v = r.fixed64f();
    else if (field === 4 || field === 5) v = r.varint();
    else if (field === 6) v = zigzag(r.varint());
    else if (field === 7) v = r.varint() !== 0;
    else r.skip(wire);
  }
  return v;
}

/** Geometry commands → array of rings/lines, each an array of [x, y] in tile units. */
function decodeGeometry(cmds) {
  const parts = [];
  let x = 0, y = 0, i = 0, cur = null;
  while (i < cmds.length) {
    const c = cmds[i++];
    const id = c & 7, count = c >> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < count; k++) {
        x += zigzag(cmds[i++]);
        y += zigzag(cmds[i++]);
        if (id === 1) { cur = [[x, y]]; parts.push(cur); } else cur.push([x, y]);
      }
    } else if (id === 7 && cur) {
      cur.push(cur[0]);
    }
  }
  return parts;
}

/**
 * Decodes a tile. Returns {layerName: [{type, props, geometry}]} where geometry
 * is converted to [lng, lat] pairs using the tile's z/x/y.
 * @param {Uint8Array} buf
 */
export function decodeTile(buf, z, tx, ty) {
  const n = Math.pow(2, z);
  const toLngLat = (px, py, extent) => {
    const lng = ((tx + px / extent) / n) * 360 - 180;
    const yy = Math.PI * (1 - (2 * (ty + py / extent)) / n);
    const lat = (Math.atan(Math.sinh(yy)) * 180) / Math.PI;
    return [lng, lat];
  };
  const layers = {};
  const r = reader(buf);
  while (r.more()) {
    const { field, wire } = r.tag();
    if (field !== 3) { r.skip(wire); continue; }
    const lr = reader(r.bytes());
    let name = '', extent = 4096;
    const keys = [], values = [], raw = [];
    while (lr.more()) {
      const t = lr.tag();
      if (t.field === 1) name = utf8(lr.bytes());
      else if (t.field === 2) raw.push(lr.bytes());
      else if (t.field === 3) keys.push(utf8(lr.bytes()));
      else if (t.field === 4) values.push(readValue(lr.bytes()));
      else if (t.field === 5) extent = lr.varint();
      else lr.skip(t.wire);
    }
    layers[name] = raw.map((fb) => {
      const fr = reader(fb);
      let tags = [], type = 0, geom = [];
      while (fr.more()) {
        const t = fr.tag();
        if (t.field === 2) tags = packed(fr.bytes());
        else if (t.field === 3) type = fr.varint();
        else if (t.field === 4) geom = packed(fr.bytes());
        else fr.skip(t.wire);
      }
      const props = {};
      for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = values[tags[i + 1]];
      const geometry = decodeGeometry(geom).map((part) => part.map(([px, py]) => toLngLat(px, py, extent)));
      return { type, props, geometry };
    });
  }
  return layers;
}

/** Slippy-map tile containing a point. */
export function tileFor(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latR = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
  return { z, x, y };
}
