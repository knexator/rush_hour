import * as dat from 'dat.gui';
import Shaku from "shaku/lib/shaku";
import { BlendModes, drawSprite, TextureFilterModes, Vertex, whiteTexture } from "shaku/lib/gfx";
import TextureAsset from "shaku/lib/assets/texture_asset";
import Color from "shaku/lib/utils/color";
import Vector2 from "shaku/lib/utils/vector2";
import Sprite from "shaku/lib/gfx/sprite";
import { gfx, input } from 'shaku';
import Circle from 'shaku/lib/utils/circle';
import { KeyboardKeys } from 'shaku/lib/input/key_codes';
import Animator from 'shaku/lib/utils/animator';
import { CarEffect, BackgroundEffect, N_TILES_X, N_TILES_Y, TEXTURE_TILE } from './car_effect';

const CONFIG = {
    spring: 1.0,
    force: 90.00,
    thingySpeed: 5,
    friction: 5.5,
    margin: 2 * 7 / 120, // 2 * empty pixels / texture tile size
    thingySlack: .05,
};
let gui = new dat.GUI({});
gui.remember(CONFIG);
gui.add(CONFIG, "spring", 0, 1);
gui.add(CONFIG, "force", 0, 200);
gui.add(CONFIG, "thingySpeed", 0, 50);
gui.add(CONFIG, "friction", 0, 10);
gui.add(CONFIG, "margin", 0, .5);
gui.add(CONFIG, "thingySlack", 0, .5);
gui.hide();

// init shaku
await Shaku.init();

// add shaku's canvas to document and set resolution to 800x600
document.body.appendChild(Shaku!.gfx!.canvas);
// Shaku.gfx!.setResolution(600, 600, true);
Shaku.gfx!.centerCanvas();
Shaku.gfx!.maximizeCanvasSize(false, false);

// Load resources
let cars_texture = await Shaku.assets.loadTexture('imgs/cars_normal.png', null);
cars_texture.filter = TextureFilterModes.Linear;
let frame_texture = await Shaku.assets.loadTexture('imgs/frame.png', null);
frame_texture.filter = TextureFilterModes.Linear;
let frame_sprite = new Sprite(frame_texture);
let bar_texture = await Shaku.assets.loadTexture('imgs/bar.png', null);
bar_texture.filter = TextureFilterModes.Linear;
let bar_sprite = new Sprite(bar_texture);
let knob_texture = await Shaku.assets.loadTexture('imgs/knob.png', null);
knob_texture.filter = TextureFilterModes.Linear;
let knob_sprite = new Sprite(knob_texture);
// const COLOR_KNOB_INACTIVE = Color.fromHex("#724254");
const COLOR_KNOB_INACTIVE = Color.fromHex("#462C4B");
// const COLOR_KNOB_ACTIVE = Color.fromHex("#fcebb6");
const COLOR_KNOB_ACTIVE = Color.fromHex("#c18c72");
knob_sprite.color = COLOR_KNOB_INACTIVE;

let car_effect = Shaku.gfx.createEffect(CarEffect);
let background_effect = Shaku.gfx.createEffect(BackgroundEffect);

// Define game types

// Side and corner indices:
//   [2]         [3]
//  (0,0) -[3]- (1,0)
//    |           |
//    |           |
//   [2]         [0]
//    |           |
//    |           |
//  (0,1) -[1]- (1,1) 
//   [1]         [0]



type direction = 0 | 1 | 2 | 3;

const DIRS: Record<direction, Vector2> = [
    Vector2.right,
    Vector2.down,
    Vector2.left,
    Vector2.up
];

const DI: Record<direction, number> = [1, 0, -1, 0];
const DJ: Record<direction, number> = [0, 1, 0, -1];

// hacky
// this gives the i,j of the corner in "direction - 45º"
const DI_CORNER: Record<direction, number> = [1, 0, 0, 1];
const DJ_CORNER: Record<direction, number> = [1, 1, 0, 0];

function oppDir(dir: direction): direction {
    return ((2 + dir) % 4) as direction;
}

function rotateDir(dir: direction, by: direction): direction {
    return ((dir + by) % 4) as direction;
}

function localPos(pos: Vector2): boolean {
    return pos.x >= 0 && pos.x < 1 && pos.y >= 0 && pos.y < 1;
}

const RESOLUTION = 3;
const TILE_SIZE = 80 * Shaku.gfx.canvas.width / 600;
const OFFSET = new Vector2(-TILE_SIZE / 4, -TILE_SIZE / 4);

frame_sprite.size.mulSelf(TILE_SIZE / 80);
bar_sprite.size.mulSelf(TILE_SIZE / 80);
knob_sprite.size.mulSelf(1.25 * TILE_SIZE / 80);

/** between -1 & 1, the grid's deformation; 1 means (3,2) goes to (4,3) */
let THINGY = 0;

/** Special tile */
let SI = 4;
let SJ = 4;

/** Spatial game data */
class Grid {
    // todo: change this for general grids
    public tiles: Tile[][];
    public corners: Corner[][];
    constructor(
        public w: number,
        public h: number,
    ) {
        this.corners = makeRectArrayFromFunction<Corner>(w + 1, h + 1, (i, j) => {
            return new Corner(
                i, j,
                OFFSET.add(i * TILE_SIZE, j * TILE_SIZE),
                i == 0 || j == 0 || i == w || j == h
            )
        });
        this.tiles = makeRectArrayFromFunction<Tile>(w, h, (i, j) => new Tile(i, j, i === 0 || i === w - 1 || j === 0 || j === h - 1));
    }

    draw() {
        /*for (let i = 0; i <= this.w; i++) {
            Shaku.gfx.drawLine(OFFSET.add(i * TILE_SIZE, 0), OFFSET.add(i * TILE_SIZE, this.h * TILE_SIZE), Color.black);
        }
        for (let j = 0; j <= this.h; j++) {
            Shaku.gfx.drawLine(OFFSET.add(0, j * TILE_SIZE), OFFSET.add(this.w * TILE_SIZE, j * TILE_SIZE), Color.black);
        }*/

        /*for (let j = 0; j < this.h; j++) {
            for (let i = 0; i < this.w; i++) {
                let tile = this.tiles[j][i];
                gfx.drawLinesStrip([
                    this.frame2screen(new Frame(tile, Vector2.zero, 0)),
                    this.frame2screen(new Frame(tile, Vector2.right, 0)),
                    this.frame2screen(new Frame(tile, Vector2.one, 0)),
                    this.frame2screen(new Frame(tile, Vector2.down, 0)),
                    this.frame2screen(new Frame(tile, Vector2.zero, 0)),
                ], Color.black);
            }
        }*/

        for (let j = 1; j < this.h - 1; j++) {
            for (let i = 1; i < this.w - 1; i++) {
                this.tiles[j][i].drawBackground();
            }
        }
        this.tiles[3][7].drawBackground();
    }

    update(dt: number) {
        dt = clamp(dt, 0, .01);
        //for (let k = 0; k < CONFIG.physics_accuracy; k++) {
        // for each non-border corner...
        for (let j = 2; j < this.h - 1; j++) {
            for (let i = 2; i < this.w - 1; i++) {
                let corner = this.corners[j][i];
                // move to connected corners
                for (let d = 0; d < 4; d++) {
                    let other = this.corners[j + DJ[d as direction]][i + DI[d as direction]];
                    corner.force.addSelf(other.pos.sub(corner.pos).mul(CONFIG.force * ((1 - .5 * Math.abs(THINGY)))));
                    // corner.pos.addSelf(other.pos.sub(corner.pos).mul(dt * CONFIG.force));
                    // this.forceDistanceBetweenCorners(corner, other, TILE_SIZE);
                }
            }
        }

        for (let j = 1; j < this.h; j++) {
            for (let i = 1; i < this.w; i++) {
                let corner = this.corners[j][i];
                corner.update(dt);
            }
        }

        if (THINGY > 0) {
            this.forceDistanceBetweenCorners(this.corners[SJ][SI], this.corners[SJ + 1][SI + 1], (1 - THINGY) * Math.SQRT2 * TILE_SIZE);
            this.forceDistanceBetweenCorners(this.corners[SJ + 1][SI], this.corners[SJ][SI + 1], Math.SQRT2 * TILE_SIZE * (THINGY * .3 + 1));
        }
        if (THINGY < 0) {
            this.forceDistanceBetweenCorners(this.corners[SJ + 1][SI], this.corners[SJ][SI + 1], (1 + THINGY) * Math.SQRT2 * TILE_SIZE);
            this.forceDistanceBetweenCorners(this.corners[SJ][SI], this.corners[SJ + 1][SI + 1], Math.SQRT2 * TILE_SIZE * (-THINGY * .3 + 1));
        }
        if (THINGY === 0) {
            this.forceDistanceBetweenCorners(this.corners[SJ + 1][SI], this.corners[SJ][SI + 1], Math.SQRT2 * TILE_SIZE);
            this.forceDistanceBetweenCorners(this.corners[SJ][SI], this.corners[SJ + 1][SI + 1], Math.SQRT2 * TILE_SIZE);
        }

        for (let j = 1; j < this.h - 1; j++) {
            for (let i = 1; i < this.w - 1; i++) {
                this.tiles[j][i].updateSprites();
            }
        }
    }

    forceDistanceBetweenCorners(c1: Corner, c2: Corner, target_dist: number) {
        let delta = c1.pos.sub(c2.pos);
        let dist = delta.length;
        if (dist === 0) return;
        let diff = (target_dist - dist) / dist;

        /*c1.vel.set(0, 0);
        c1.force.set(0, 0);
        c2.vel.set(0, 0);
        c2.force.set(0, 0);*/

        if (c2.fixed) {
            c1.pos.addSelf(delta.mul(diff * CONFIG.spring));
        } else {
            let move = delta.mul(diff * 0.5 * CONFIG.spring);
            c1.pos.addSelf(move);
            c2.pos.subSelf(move);
        }
    }

    screen2frame(screen_pos: Vector2): Frame | null {
        for (let j = 0; j < this.h; j++) {
            for (let i = 0; i < this.w; i++) {
                let tile = this.tiles[j][i];
                let local_pos = tile.invBilinear(screen_pos);
                if (local_pos === null) continue;
                return new Frame(tile, local_pos, 0);
            }
        }
        return null;
        // todo: change this for general grids
        /*let pos = screen_pos.sub(OFFSET).divSelf(TILE_SIZE);
        let i = Math.floor(pos.x);
        let j = Math.floor(pos.y);
        if (i < 0 || i >= this.w || j < 0 || j >= this.h) return null;
        return new Frame(this.tiles[j][i], new Vector2(pos.x % 1, pos.y % 1), 0);*/
    }

    frame2screen(frame: Frame): Vector2 {
        frame = frame.clone().redir(0);
        let y_high = Vector2.lerp(frame.tile.corner(1).pos, frame.tile.corner(0).pos, frame.pos.x);
        let y_low = Vector2.lerp(frame.tile.corner(2).pos, frame.tile.corner(3).pos, frame.pos.x);
        return Vector2.lerp(y_low, y_high, frame.pos.y);
    }

    frame2screenDirX(frame: Frame): Vector2 {
        // real direction
        let x_low = Vector2.lerp(frame.tile.corner(rotateDir(2, frame.dir)).pos, frame.tile.corner(rotateDir(1, frame.dir)).pos, frame.pos.y);
        let x_high = Vector2.lerp(frame.tile.corner(rotateDir(3, frame.dir)).pos, frame.tile.corner(rotateDir(0, frame.dir)).pos, frame.pos.y);
        return x_high.sub(x_low).normalizeSelf();
    }

    frame2screenDirY(frame: Frame): Vector2 {
        // real direction
        let y_low = Vector2.lerp(frame.tile.corner(rotateDir(2, frame.dir)).pos, frame.tile.corner(rotateDir(3, frame.dir)).pos, frame.pos.x);
        let y_high = Vector2.lerp(frame.tile.corner(rotateDir(1, frame.dir)).pos, frame.tile.corner(rotateDir(0, frame.dir)).pos, frame.pos.x);
        return y_high.sub(y_low).normalizeSelf();
    }

    frame2screenDirs(frame: Frame): Color {
        let dir_x = this.frame2screenDirX(frame);
        let dir_y = this.frame2screenDirY(frame);
        return new Color(dir_x.x, dir_x.y, dir_y.x, dir_y.y);
    }
}

class Corner {
    // private prev_pos: Vector2;
    public vel: Vector2;
    public force: Vector2;
    constructor(
        public i: number, // todo: change this for general grids
        public j: number, // todo: change this for general grids
        public pos: Vector2,
        public fixed: boolean,
    ) {
        // this.prev_pos = pos.clone();
        this.vel = Vector2.zero;
        this.force = Vector2.zero;
    }

    /*updatePos() {
        // if (this.i !== 3 && this.i !== 4) return;
        // if (this.j !== 3 && this.j !== 4) return;
        if (this.i === 3 && this.j === 3) {
            this.pos.copy(OFFSET.add(TILE_SIZE * 3, TILE_SIZE * 3).add(new Vector2(.5, .5).mulSelf(TILE_SIZE * THINGY)));
        }
        if (this.i === 4 && this.j === 4) {
            this.pos.copy(OFFSET.add(TILE_SIZE * 4, TILE_SIZE * 4).add(new Vector2(-.5, -.5).mulSelf(TILE_SIZE * THINGY)));
        }

        if (this.i === 3 && this.j === 4) {
            this.pos.copy(OFFSET.add(TILE_SIZE * 3, TILE_SIZE * 4).add(new Vector2(-.5, .5).mulSelf(TILE_SIZE * THINGY)));
        }
        if (this.i === 4 && this.j === 3) {
            this.pos.copy(OFFSET.add(TILE_SIZE * 4, TILE_SIZE * 3).add(new Vector2(.5, -.5).mulSelf(TILE_SIZE * THINGY)));
        }
    }*/

    update(dt: number) {
        this.vel.addSelf(this.force.mul(dt));
        this.pos.addSelf(this.vel.mul(dt));
        this.force.set(0, 0);
        this.vel.mulSelf(1 / (1 + (dt * CONFIG.friction)))
    }
}

class Tile {
    // private sprite: Sprite;
    public sprites: Sprite[][];
    public verts: Vector2[][];
    constructor(
        public i: number, // todo: change this for general grids
        public j: number, // todo: change this for general grids
        // Game logic
        public wall: boolean,
        public car: Car | null = null,
    ) {
        this.verts = makeRectArrayFromFunction<Vector2>(RESOLUTION + 1, RESOLUTION + 1, (i, j) => {
            return Vector2.zero;
        });

        this.sprites = makeRectArrayFromFunction<Sprite>(RESOLUTION, RESOLUTION, (i, j) => {
            let sprite = new Sprite(cars_texture);
            sprite.static = true;
            let uv_top_left = new Vector2(i / RESOLUTION, j / RESOLUTION);
            let uv_bottom_right = new Vector2((i + 1) / RESOLUTION, (j + 1) / RESOLUTION);
            sprite._cachedVertices = [
                // @ts-ignore
                new Vertex(this.verts[j][i], uv_top_left), // topLeft
                // @ts-ignore
                new Vertex(this.verts[j][i + 1]), // topRight
                // @ts-ignore
                new Vertex(this.verts[j + 1][i]), // bottomLeft
                // @ts-ignore
                new Vertex(this.verts[j + 1][i + 1], uv_bottom_right), // bottomRight
            ];
            sprite.color = [
                new Color(1, 0, 0, 1), // topLeft
                new Color(1, 0, 0, 1), // topRight
                new Color(1, 0, 0, 1), // bottomLeft
                new Color(1, 0, 0, 1), // bottomRight
            ]
            return sprite;
        });
    }

    adjacent(dir: direction): Tile | null {
        // todo: change this for general grids
        let ni = this.i + DI[dir];
        let nj = this.j + DJ[dir];
        if (ni < 0 || ni >= grid.w || nj < 0 || nj >= grid.h) return null;

        if (ni === SI && nj === SJ) {
            if (THINGY > .5) {
                switch (this.i) {
                    case SI - 1:
                        nj += 1;
                        break;
                    case SI + 1:
                        nj -= 1;
                        break;
                    case SI:
                        ni += (this.j < SJ) ? 1 : -1;
                        break;
                    default:
                        throw new Error("bad grid");
                }
            } else if (THINGY < -.5) {
                switch (this.i) {
                    case SI - 1:
                        nj -= 1;
                        break;
                    case SI + 1:
                        nj += 1;
                        break;
                    case SI:
                        ni += (this.j < SJ) ? -1 : 1;
                        break;
                    default:
                        throw new Error("bad grid");
                }
            }
        }

        return grid.tiles[nj][ni];
    }

    corner(dir: direction): Corner {
        // todo: change this for general grids
        let ni = this.i + DI_CORNER[dir];
        let nj = this.j + DJ_CORNER[dir];
        return grid.corners[nj][ni];
    }

    updateSprites() {
        let temp_frame = new Frame(this, Vector2.zero, 0);
        for (let j = 0; j <= RESOLUTION; j++) {
            for (let i = 0; i <= RESOLUTION; i++) {
                temp_frame.pos.set(i / RESOLUTION, j / RESOLUTION);
                this.verts[j][i].copy(grid.frame2screen(temp_frame))
            }
        }


        /*this.sprite._cachedVertices = [
            // @ts-ignore
            new Vertex(this.corner(1).pos, Vector2.zero), // topLeft
            // @ts-ignore
            new Vertex(this.corner(0).pos), // topRight
            // @ts-ignore
            new Vertex(this.corner(2).pos), // bottomLeft
            // @ts-ignore
            new Vertex(this.corner(3).pos, Vector2.one), // bottomRight
        ]*/
    }

    drawBackground() {
        // return
        Shaku.gfx.useEffect(background_effect);

        this.drawSprites();

        // @ts-ignore
        Shaku.gfx.useEffect(null);
    }

    drawSprites() {
        for (let j = 0; j < RESOLUTION; j++) {
            for (let i = 0; i < RESOLUTION; i++) {
                Shaku.gfx.drawSprite(this.sprites[j][i]);
            }
        }
        Shaku.gfx.spritesBatch.end();
    }

    // from https://iquilezles.org/articles/ibilinear/
    invBilinear(screen_pos: Vector2): Vector2 | null {
        let a = this.corner(2).pos;
        let b = this.corner(3).pos;
        let c = this.corner(0).pos;
        let d = this.corner(1).pos;

        let e = b.sub(a);
        let f = d.sub(a);
        let g = a.sub(b).add(c).sub(d);
        let h = screen_pos.sub(a);

        let k2 = Vector2.cross(g, f);
        let k1 = Vector2.cross(e, f) + Vector2.cross(h, g);
        let k0 = Vector2.cross(h, e);

        // if edges are parallel, this is a linear equation
        if (Math.abs(k2) < 0.001) {
            let u = (h.x * k1 + f.x * k0) / (e.x * k1 - g.x * k0);
            let v = -k0 / k1;
            if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) {
                return null;
            }
            return new Vector2(u, v);
        }
        // otherwise, it's a quadratic
        else {
            let w = k1 * k1 - 4.0 * k0 * k2;
            if (w < 0.0) return null;
            w = Math.sqrt(w);

            let ik2 = 0.5 / k2;
            let v = (-k1 - w) * ik2;
            let u = (h.x - f.x * v) / (e.x + g.x * v);

            if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) {
                v = (-k1 + w) * ik2;
                u = (h.x - f.x * v) / (e.x + g.x * v);

                if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) {
                    return null;
                }
            }
            return new Vector2(u, v);
        }
    }
}

/** Frame of reference: position and rotation */
class Frame {
    constructor(
        public tile: Tile,
        /** Both coordinates are in [0, 1) */
        public pos: Vector2,
        /** Relative to the current tile; 90° ccw would be a dir of 1 (since the frame's "right" is the tile's "up" (1)) */
        public dir: direction,
    ) { }

    redir(new_dir: direction): Frame {
        while (this.dir !== new_dir) {
            this.rotccw();
        }
        return this;
    }

    rotccw(): Frame {
        this.dir = (this.dir + 1) % 4 as direction;
        this.pos.set(
            this.pos.y,
            1.0 - this.pos.x
        )
        return this;
    }

    move(dir: direction, dist: number): Frame | null {
        // all grid logic goes here
        if (dist < 0) {
            return this.move(oppDir(dir), -dist);
        }
        if (dist == 0) return this;
        if (dist > 1) {
            return this.move(dir, 1)?.move(dir, dist - 1) || null;
        }

        let new_pos = this.pos.add(DIRS[dir].mul(dist));
        if (localPos(new_pos)) {
            this.pos = new_pos;
            return this;
        } else {
            // we went out of the tile
            let new_tile = this.tile.adjacent(rotateDir(dir, this.dir));
            if (new_tile === null) return null;

            // go back to a 0..1 position
            this.pos = new_pos.sub(DIRS[dir]);
            if (!localPos(this.pos)) {
                // console.log("implementation error in Frame.move, this should be a local pos: ", this.pos.x, this.pos.y);
                // throw new Error("implementation error in Frame.move");
            }

            // going back should bring us back; if not, correct direction
            while (new_tile.adjacent(rotateDir(oppDir(dir), this.dir)) !== this.tile) {
                this.dir = rotateDir(this.dir, 1);
            }
            /*for (var i = 0; i < 4; i++) {
                if (this.tile == new_tile.adjacent[((4 + i + 2 + ind - this.dir) % 4)]) {
                    this.dir = i % 4 as direction;
                    break;
                }
            }*/
            this.tile = new_tile;
            /*while (this.tile.adjacent(rotateDir(this.dir, 2)) {

            }*/

            return this;
        }
    }

    clone() {
        return new Frame(this.tile, this.pos.clone(), this.dir);
    }
}

class Car {
    /** positive offset = the car is moving forwards, in the head.right direction */
    public offset: number;

    private tail: Frame;
    private next: Frame | null;
    public prev: Frame | null;

    public texture_i: number;
    public texture_j: number;

    constructor(
        /** Car extends from head to head.left */
        public head: Frame,
        public length: number,
        public main: boolean = false,
    ) {
        this.offset = 0;

        let cur_head = head.clone();
        cur_head.tile.car = this;
        for (let k = 1; k < this.length; k++) {
            cur_head.move(2, 1.0);
            cur_head.tile.car = this;
        }
        this.tail = cur_head.clone();
        this.prev = cur_head.move(2, 1.0);
        this.next = head.clone().move(0, 1.0);

        this.texture_i = 0;
        this.texture_j = 0;
        if (this.length === 3) {
            this.texture_j = N_TILES_Y - 1;
        }
    }

    recalcStuff() {
        let cur_head = this.head.clone();
        for (let k = 1; k < this.length; k++) {
            cur_head.move(2, 1.0);
        }
        this.tail = cur_head.clone();
        this.prev = cur_head.move(2, 1.0);
        this.next = this.head.clone().move(0, 1.0);
    }

    addOffset(delta: number) {
        delta = clamp(delta, -1, 1);
        this.offset += delta;

        if (ENDING && this.main) {
            return;
        }

        // Check movement legality
        if (this.offset >= CONFIG.margin && (this.next === null || this.next.tile.car !== null || this.next.tile.wall)) {
            this.offset = CONFIG.margin * .99;
        }
        if (this.offset <= -CONFIG.margin && (this.prev === null || this.prev.tile.car !== null || this.prev.tile.wall)) {
            this.offset = -CONFIG.margin * .99;
        }
        if (this.main && delta < 0 && this.prev === null && this.offset < -0.1) {
            startEnding()
        }

        if (this.offset >= .5) {
            // went forward
            this.offset -= 1;
            this.next!.tile.car = this;
            this.tail.tile.car = null;

            this.prev = this.tail.clone();
            this.tail.move(0, 1.0);
            this.head = this.next!.clone();
            this.next!.move(0, 1.0);
        } else if (this.offset < -.5) {
            // went backward
            this.offset += 1;
            this.prev!.tile.car = this;
            this.head.tile.car = null;

            this.next = this.head.clone();
            this.head.move(2, 1.0);
            this.tail = this.prev!.clone();
            // this.prev!.move(2, 1.0);
            this.prev = this.prev!.move(2, 1.0);
        }
    }

    draw() {
        /*let visual_head = this.head.clone().move(0, this.offset)!;
        for (let k = 0; k < this.length; k++) {
            gfx.fillCircle(new Circle(grid.frame2screen(visual_head), TILE_SIZE / 3), Color.white);
            // gfx.fillCircle(new Circle(this.grid.frame2screen(visual_head), TILE_SIZE / 3), this.color);
            visual_head.move(2, 1.0);
        }*/

        Shaku.gfx.useEffect(car_effect);

        for (let k = this.offset > 0 ? -1 : 0; k < (this.offset < 0 ? this.length + 1 : this.length); k++) {
            let cur_frame = this.head.clone().move(2, k);
            if (cur_frame === null) continue;

            let corner = new Vector2(((3 + this.texture_i * 3) - k - this.offset) / N_TILES_X, this.texture_j / N_TILES_Y);
            let dir_u = new Vector2(1 / N_TILES_X, 0);
            let dir_v = new Vector2(0, 1 / N_TILES_Y);

            for (let i = 0; i < cur_frame.dir; i++) {
                corner.addSelf(dir_v);
                let temp = dir_u.clone();
                dir_u = dir_v.mul(-1);
                dir_v = temp;
            }

            // @ts-ignore
            car_effect.uniforms.uv_pos(corner.x, corner.y);
            // @ts-ignore
            car_effect.uniforms.uv_col_u(dir_u.x, dir_u.y);
            // @ts-ignore
            car_effect.uniforms.uv_col_v(dir_v.x, dir_v.y);

            for (let j = 0; j < RESOLUTION; j++) {
                for (let i = 0; i < RESOLUTION; i++) {
                    let sprite = cur_frame.tile.sprites[j][i];
                    let uv_top_left = new Vector2(i / RESOLUTION, j / RESOLUTION);
                    let uv_bottom_right = new Vector2((i + 1) / RESOLUTION, (j + 1) / RESOLUTION);
                    sprite.color = [
                        grid.frame2screenDirs(new Frame(cur_frame.tile, uv_top_left, cur_frame.dir)), // topLeft
                        grid.frame2screenDirs(new Frame(cur_frame.tile, new Vector2(uv_bottom_right.x, uv_top_left.y), cur_frame.dir)), // topRight
                        grid.frame2screenDirs(new Frame(cur_frame.tile, new Vector2(uv_top_left.x, uv_bottom_right.y), cur_frame.dir)), // bottomLeft
                        grid.frame2screenDirs(new Frame(cur_frame.tile, uv_bottom_right, cur_frame.dir)), // bottomRight
                    ]
                }
            }

            /*
            if (this.main) {
                // @ts-ignore
                car_effect.uniforms.color_high(0.663, 0.941, 0.373);
                // @ts-ignore
                car_effect.uniforms.color_mid(0.373, 0.678, 0.404);
                // @ts-ignore
                car_effect.uniforms.color_low(0.306, 0.369, 0.369);
            }
            */
            if (this.main) {
                // @ts-ignore
                car_effect.uniforms.color_high(0.988, 0.922, 0.714);
                // @ts-ignore
                car_effect.uniforms.color_mid(0.663, 0.941, 0.373);
                // @ts-ignore
                car_effect.uniforms.color_low(0.373, 0.678, 0.404);
            }

            cur_frame.tile.drawSprites();

            if (this.main) {
                // @ts-ignore
                car_effect.uniforms.color_high(0.62, 0.906, 0.843);
                // @ts-ignore
                car_effect.uniforms.color_mid(0.416, 0.753, 0.741);
                // @ts-ignore
                car_effect.uniforms.color_low(0.345, 0.537, 0.635);
            }
        }

        // @ts-ignore
        Shaku.gfx.useEffect(null);
    }
}

let dragging: {
    car: Car;
    /** 0 if grabbed exactly at head; -1.5 if grabbed exactly at the far end of a 2-sized car */
    total_offset: number;
    // segment: number;
    // offset: number;
} | null = null;
let dragging_knob = false;

let background_color = Color.fromHex("#4e5e5e");

let border_sprite = new Sprite(whiteTexture);
border_sprite.origin.set(0, 0);
border_sprite.size.set(6 * TILE_SIZE + CONFIG.margin * TILE_SIZE, 6 * TILE_SIZE + CONFIG.margin * TILE_SIZE)
border_sprite.position = OFFSET.add(TILE_SIZE - CONFIG.margin * TILE_SIZE * .5, TILE_SIZE - CONFIG.margin * TILE_SIZE * .5);
border_sprite.color = Color.fromHex("#462c4b")

let grid = new Grid(8, 8);
for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
        grid.tiles[j][i].updateSprites();
    }
}
grid.tiles[3][7].wall = false;

frame_sprite.position = OFFSET.add(TILE_SIZE * 4, TILE_SIZE * 4);
bar_sprite.position = OFFSET.add(TILE_SIZE * 4, TILE_SIZE * 7.75);
knob_sprite.position = OFFSET.add(TILE_SIZE * 4, TILE_SIZE * 7.75);

let extra_sprite = new Sprite(whiteTexture);
extra_sprite.origin.set(0, 0);
extra_sprite.size.set(TILE_SIZE, TILE_SIZE);
extra_sprite.position = OFFSET.add(TILE_SIZE * 7 + 1 + 2 * CONFIG.margin * TILE_SIZE, TILE_SIZE * 3);
extra_sprite.color = Color.fromHex("#4e5e5e")

let ENDING = false;

// todo: directions 1 & 3 seem swapped
// Beatable!
let cars = [

    new Car(new Frame(grid.tiles[3][2], Vector2.half, 2), 2, true),
    new Car(new Frame(grid.tiles[3][4], Vector2.half, 1), 3),
    new Car(new Frame(grid.tiles[4][4], Vector2.half, 3), 2),

    new Car(new Frame(grid.tiles[4][3], Vector2.half, 3), 3),
    new Car(new Frame(grid.tiles[2][1], Vector2.half, 2), 2),

    new Car(new Frame(grid.tiles[4][1], Vector2.half, 1), 2),
    new Car(new Frame(grid.tiles[5][1], Vector2.half, 2), 2),
    // new Car(new Frame(grid.tiles[5][5], Vector2.half, 2), 2),
    new Car(new Frame(grid.tiles[3][6], Vector2.half, 3), 2),

    new Car(new Frame(grid.tiles[6][4], Vector2.half, 2), 3),
]

function specialTileInUse(): boolean {
    if (Math.abs(THINGY) <= .5) {
        return grid.tiles[SJ][SI].car !== null;
    } else {
        let car_top = grid.tiles[SJ - 1][SI].car;
        let car_bot = grid.tiles[SJ + 1][SI].car;
        let car_left = grid.tiles[SJ][SI - 1].car;
        let car_right = grid.tiles[SJ][SI + 1].car;
        if (THINGY > .5) {
            return (car_top !== null && car_right !== null && car_top === car_right) || (car_bot !== null && car_left !== null && car_bot === car_left)
        } else {
            return (car_top !== null && car_left !== null && car_top === car_left) || (car_bot !== null && car_right !== null && car_bot === car_right)
        }
    }
}

function startEnding() {
    ENDING = true;
    dragging = null;

    for (let i = 1; i < grid.w - 1; i++) {
        let tile = grid.tiles[3][i];
        if (tile.car && tile.car.main) {
            tile.car = null;
        }
    }

    new Animator(cars[0]).to({ "offset": -1.4 }).duration(.4).play();

    let thanksElement = document.getElementById("thanks")!;
    thanksElement.style.opacity = "1";
    thanksElement.style.marginTop = "9vw";
    console.log("ending");
}

// do a single main loop step and request the next step
function step() {
    // start a new frame and clear screen
    Shaku.startFrame();
    Shaku.gfx!.clear(background_color);

    // EDITOR
    /*
    let mouse_frame = grid.screen2frame(input.mousePosition)
    if (mouse_frame !== null) {
        if (mouse_frame.tile.car !== null) {
            // delete
            if (input.keyPressed(KeyboardKeys.n1)) {
                let car = mouse_frame.tile.car;
                cars = cars.filter(x => x != car);
                forEachTile(grid.tiles, (tile, i, j) => {
                    if (tile.car === car) {
                        tile.car = null;
                    }
                })
            }
        } else {
            if (input.keyPressed(KeyboardKeys.n2) || input.keyPressed(KeyboardKeys.n3)) {
                while (true) {
                    console.log(mouse_frame.pos, mouse_frame.dir);
                    if (mouse_frame.pos.x - .5 > Math.abs(mouse_frame.pos.y - .5)) {
                        break;
                    }
                    mouse_frame.rotccw();
                }
                cars.push(new Car(new Frame(mouse_frame.tile, Vector2.half, mouse_frame.dir), input.keyPressed(KeyboardKeys.n2) ? 2 : 3));
            }
        }
    }
    */

    let in_use = specialTileInUse();
    knob_sprite.color = in_use ? COLOR_KNOB_INACTIVE : COLOR_KNOB_ACTIVE;

    let mouse_pos = Shaku.input.mousePosition;
    let close_to_knob = mouse_pos.distanceTo(knob_sprite.position as Vector2) < TILE_SIZE * .25;
    let hover_frame = grid.screen2frame(mouse_pos);
    if (dragging_knob || dragging) {
        document.body.style.cursor = "grabbing";
    } else {
        if (close_to_knob || (hover_frame && hover_frame.tile.car)) {
            document.body.style.cursor = "grab";
        } else {
            document.body.style.cursor = "default";
        }
    }

    if (dragging === null) {
        /*if (input.keyDown(KeyboardKeys.down) || input.keyDown(KeyboardKeys.s)) {
            thingyGoal = in_use ? moveTowards(thingyGoal, 0, CONFIG.thingySlack) : 0;
        } else if (input.keyDown(KeyboardKeys.right) || input.keyDown(KeyboardKeys.d)) {
            thingyGoal = in_use ? moveTowards(thingyGoal, 1, CONFIG.thingySlack) : 1;
        } else if (input.keyDown(KeyboardKeys.left) || input.keyDown(KeyboardKeys.a)) {
            thingyGoal = in_use ? moveTowards(thingyGoal, -1, CONFIG.thingySlack) : -1;
        }*/
        if (close_to_knob && !dragging_knob && input.mousePressed()) {
            dragging_knob = true;
        }
        if (dragging_knob) {
            let goal = ((OFFSET.x + TILE_SIZE * 4) - mouse_pos.x) / (TILE_SIZE * 2);
            goal = clamp(goal, -1, 1);
            if (!in_use) {
                THINGY = goal;
            } else {
                goal = moveTowards(Math.round(THINGY), goal, CONFIG.thingySlack);
                THINGY = clamp(goal, -1, 1);
            }
            if (Shaku.input.mouseReleased()) {
                dragging_knob = false;
            }
        } else {
            let thingyGoal = Math.round(THINGY);
            THINGY = moveTowards(THINGY, thingyGoal, Shaku.gameTime.delta * CONFIG.thingySpeed);
        }
        knob_sprite.position.x = OFFSET.x + TILE_SIZE * 4 - THINGY * TILE_SIZE * 2;
        cars.forEach(c => c.recalcStuff());

        if (input.mousePressed()) {
            if (hover_frame !== null && hover_frame.tile.car !== null) {
                let car = hover_frame.tile.car;
                let segment = 0;
                let car_head = car.head.clone();
                while (car_head.tile != hover_frame.tile) {
                    segment++;
                    car_head.move(2, 1.0);
                }
                hover_frame.redir(car_head.dir);
                let offset = hover_frame.pos.x - .5;

                dragging = {
                    car: car,
                    total_offset: offset - segment,
                }
            }
        }
    } else {
        if (input.mouseReleased()) {
            if (dragging.car.main && dragging.car.prev === null) {
                startEnding();
            } else {
                new Animator(dragging.car).to({ "offset": 0 }).duration(.1).play();
            }
            dragging = null;
        } else {
            let cur_mouse_frame = dragging.car.head.clone().move(0, dragging.car.offset + dragging.total_offset);
            if (cur_mouse_frame === null) {
                console.log("dragging error: ", dragging);
                cur_mouse_frame = dragging.car.head.clone();
                // throw new Error("how could this happen??");
            }
            let forward = grid.frame2screen(cur_mouse_frame.clone().move(0, .05) || cur_mouse_frame);
            let backward = grid.frame2screen(cur_mouse_frame.clone().move(2, .05) || cur_mouse_frame);
            let delta_vec = forward.sub(backward).normalizeSelf();
            dragging.car.addOffset(Vector2.dot(delta_vec, input.mouseDelta) / TILE_SIZE);
        }
    }

    Shaku.gfx.drawSprite(border_sprite);
    grid.update(Shaku.gameTime.delta);
    grid.draw();
    cars.forEach(c => c.draw());
    Shaku.gfx.drawSprite(frame_sprite);
    Shaku.gfx.drawSprite(extra_sprite);
    Shaku.gfx.drawSprite(bar_sprite);
    Shaku.gfx.drawSprite(knob_sprite);

    // end frame and request next step
    Shaku.endFrame();
    Shaku.requestAnimationFrame(step);
}

let hola = Shaku!.gfx!.canvas;
console.log(hola);

// console.log(Shaku)

// start main loop
step();

function makeRectArray<T>(width: number, height: number, fill: T): T[][] {
    let result: T[][] = [];
    for (let j = 0; j < height; j++) {
        let cur_row: T[] = [];
        for (let i = 0; i < width; i++) {
            cur_row.push(fill);
        }
        result.push(cur_row);
    }
    return result;
}

function makeRectArrayFromFunction<T>(width: number, height: number, fill: (i: number, j: number) => T): T[][] {
    let result: T[][] = [];
    for (let j = 0; j < height; j++) {
        let cur_row: T[] = [];
        for (let i = 0; i < width; i++) {
            cur_row.push(fill(i, j));
        }
        result.push(cur_row);
    }
    return result;
}

function forEachTile<T>(map: T[][], func: (tile: T, i: number, j: number) => void) {
    for (let j = 0; j < map.length; j++) {
        let cur_row = map[j];
        for (let i = 0; i < map[0].length; i++) {
            func(cur_row[i], i, j);
        }
    }
}

function clamp(value: number, a: number, b: number) {
    if (value < a) return a;
    if (value > b) return b;
    return value;
}

function moveTowards(cur_val: number, target_val: number, max_delta: number): number {
    if (target_val > cur_val) {
        return Math.min(cur_val + max_delta, target_val);
    } else if (target_val < cur_val) {
        return Math.max(cur_val - max_delta, target_val);
    } else {
        return target_val;
    }
}

function moveTowardsV(cur_val: Vector2, target_val: Vector2, max_dist: number): Vector2 {
    let delta = target_val.sub(cur_val);
    let dist = delta.length;
    if (dist < max_dist) {
        // already arrived
        return target_val.clone();
    }
    delta.mulSelf(max_dist / dist);
    return cur_val.add(delta);
}