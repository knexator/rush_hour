import * as dat from 'dat.gui';
import Shaku from "shaku/lib/shaku";
import { BlendModes, Vertex, whiteTexture } from "shaku/lib/gfx";
import TextureAsset from "shaku/lib/assets/texture_asset";
import Color from "shaku/lib/utils/color";
import Vector2 from "shaku/lib/utils/vector2";
import Sprite from "shaku/lib/gfx/sprite";
import { gfx, input } from 'shaku';
import Circle from 'shaku/lib/utils/circle';
import { KeyboardKeys } from 'shaku/lib/input/key_codes';
import Animator from 'shaku/lib/utils/animator';

const CONFIG = {
    value_1: 100,
    value_2: 0.6,
};
let gui = new dat.GUI({});
gui.remember(CONFIG);
gui.add(CONFIG, "value_1", 0, 200);
gui.add(CONFIG, "value_2", -1, 1);

// init shaku
await Shaku.init();

// add shaku's canvas to document and set resolution to 800x600
document.body.appendChild(Shaku!.gfx!.canvas);
Shaku.gfx!.setResolution(800, 600, true);
// Shaku.gfx!.centerCanvas();
// Shaku.gfx!.maximizeCanvasSize(false, false);

// Load resources
let cars_texture = await Shaku.assets.loadTexture('imgs/cars.png', null);


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

const TILE_SIZE = 50;
const OFFSET = new Vector2(100, 100);

/** between -1 & 1, the grid's deformation; 1 means (3,2) goes to (4,3) */
let THINGY = 0;

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
        this.tiles = makeRectArrayFromFunction<Tile>(w, h, (i, j) => new Tile(i, j));
    }

    draw() {
        /*for (let i = 0; i <= this.w; i++) {
            Shaku.gfx.drawLine(OFFSET.add(i * TILE_SIZE, 0), OFFSET.add(i * TILE_SIZE, this.h * TILE_SIZE), Color.black);
        }
        for (let j = 0; j <= this.h; j++) {
            Shaku.gfx.drawLine(OFFSET.add(0, j * TILE_SIZE), OFFSET.add(this.w * TILE_SIZE, j * TILE_SIZE), Color.black);
        }*/

        for (let j = 0; j < this.h; j++) {
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
        }

        for (let j = 0; j < this.h; j++) {
            for (let i = 0; i < this.w; i++) {
                let tile = this.tiles[j][i];
                if (tile.car !== null) {
                    tile.debugDrawFull(tile.car.color);
                }
            }
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
        var y_high = Vector2.lerp(frame.tile.corner(1).pos, frame.tile.corner(0).pos, frame.pos.x);
        var y_low = Vector2.lerp(frame.tile.corner(2).pos, frame.tile.corner(3).pos, frame.pos.x);
        return Vector2.lerp(y_low, y_high, frame.pos.y);
    }
}

class Corner {
    constructor(
        public i: number, // todo: change this for general grids
        public j: number, // todo: change this for general grids
        public pos: Vector2,
        public fixed: boolean,
    ) { }

    updatePos() {
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
    }
}

class Tile {
    private sprite: Sprite
    constructor(
        public i: number, // todo: change this for general grids
        public j: number, // todo: change this for general grids
        // Game logic
        public car: Car | null = null,
    ) {
        this.sprite = new Sprite(whiteTexture);
        this.sprite.static = true;
        let top_left = OFFSET.add(i * TILE_SIZE, j * TILE_SIZE);
        this.sprite._cachedVertices = [
            // @ts-ignore
            new Vertex(top_left, Vector2.zero), // topLeft
            // @ts-ignore
            new Vertex(top_left.add(TILE_SIZE, 0)), // topRight
            // @ts-ignore
            new Vertex(top_left.add(0, TILE_SIZE)), // bottomLeft
            // @ts-ignore
            new Vertex(top_left.add(TILE_SIZE, TILE_SIZE), Vector2.one), // bottomRight
        ]
    }

    adjacent(dir: direction): Tile | null {
        // todo: change this for general grids
        let ni = this.i + DI[dir];
        let nj = this.j + DJ[dir];
        if (ni < 0 || ni >= grid.w || nj < 0 || nj >= grid.h) return null;

        if (ni === 3 && nj === 3) {
            if (THINGY > .5) {
                switch (this.i) {
                    case 2:
                        nj += 1;
                        break;
                    case 4:
                        nj -= 1;
                        break;
                    case 3:
                        ni += (this.j === 2) ? 1 : -1;
                        break;
                    default:
                        throw new Error("bad grid");
                }
            } else if (THINGY < -.5) {
                switch (this.i) {
                    case 2:
                        nj -= 1;
                        break;
                    case 4:
                        nj += 1;
                        break;
                    case 3:
                        ni += (this.j === 2) ? -1 : 1;
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

    updateSprite() {
        console.log()
        this.sprite._cachedVertices = [
            // @ts-ignore
            new Vertex(this.corner(1).pos, Vector2.zero), // topLeft
            // @ts-ignore
            new Vertex(this.corner(0).pos), // topRight
            // @ts-ignore
            new Vertex(this.corner(2).pos), // bottomLeft
            // @ts-ignore
            new Vertex(this.corner(3).pos, Vector2.one), // bottomRight
        ]
    }

    debugDrawFull(color: Color) {
        this.sprite.color = color;
        Shaku.gfx.drawSprite(this.sprite);
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

    private rotccw(): Frame {
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
                throw new Error("implementation error in Frame.move");
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
    private prev: Frame | null;

    constructor(
        /** Car extends from head to head.left */
        public head: Frame,
        public length: number,
        public color: Color,
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

        // Check movement legality
        if (this.offset > .1 && (this.next === null || this.next.tile.car !== null)) {
            this.offset = .1;
        }
        if (this.offset < -.1 && (this.prev === null || this.prev.tile.car !== null)) {
            this.offset = -.1;
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
            this.prev!.move(2, 1.0);
        }
    }

    draw() {
        /*let visual_head = this.head.clone().move(0, this.offset)!;
        visual_head.tile.debugDrawFull(Color.blue);
        for (let k = 1; k < this.length; k++) {
            visual_head.move(2, 1.0);
            visual_head.tile.debugDrawFull(Color.blue);
        }*/

        let visual_head = this.head.clone().move(0, this.offset)!;
        for (let k = 0; k < this.length; k++) {
            gfx.fillCircle(new Circle(grid.frame2screen(visual_head), TILE_SIZE / 3), Color.white);
            // gfx.fillCircle(new Circle(this.grid.frame2screen(visual_head), TILE_SIZE / 3), this.color);
            visual_head.move(2, 1.0);
        }
    }
}

let dragging: {
    car: Car;
    /** 0 if grabbed exactly at head; -1.5 if grabbed exactly at the far end of a 2-sized car */
    total_offset: number;
    // segment: number;
    // offset: number;
} | null = null;

let grid = new Grid(6, 6);
for (let j = 0; j < grid.h; j++) {
    for (let i = 0; i < grid.w; i++) {
        grid.tiles[j][i].updateSprite();
    }
}

// todo: directions 1 & 3 seem swapped
// Beatable!
let cars = [
    new Car(new Frame(grid.tiles[2][1], Vector2.half, 0), 2, Color.red),
    new Car(new Frame(grid.tiles[2][3], Vector2.half, 1), 3, Color.yellow),
    new Car(new Frame(grid.tiles[4][3], Vector2.half, 3), 2, Color.lime),

    new Car(new Frame(grid.tiles[2][2], Vector2.half, 3), 3, Color.cyan),
    new Car(new Frame(grid.tiles[1][1], Vector2.half, 2), 2, Color.magenta),

    new Car(new Frame(grid.tiles[1][0], Vector2.half, 1), 2, Color.orange),
    new Car(new Frame(grid.tiles[4][0], Vector2.half, 2), 2, Color.lightpink),
    // new Car(new Frame(grid.tiles[4][4], Vector2.half, 2), 2, Color.darkgreen),
    new Car(new Frame(grid.tiles[1][5], Vector2.half, 3), 2, Color.purple),

    new Car(new Frame(grid.tiles[5][0], Vector2.half, 2), 3, Color.gray),
]

/*let magic_sprite = new Sprite(cars_texture);
magic_sprite.static = true;
magic_sprite._cachedVertices = [
    // @ts-ignore
    new Vertex(new Vector2(100, 100), Vector2.zero), // topLeft
    // @ts-ignore
    new Vertex(new Vector2(400, 150)), // topRight
    // @ts-ignore
    new Vertex(new Vector2(200, 500)), // bottomLeft
    // @ts-ignore
    new Vertex(new Vector2(500, 450), Vector2.one), // bottomRight
]*/

function specialTileInUse(): boolean {
    if (Math.abs(THINGY) <= .5) {
        return grid.tiles[3][3].car !== null;
    } else {
        let car_top = grid.tiles[2][3].car;
        let car_bot = grid.tiles[4][3].car;
        let car_left = grid.tiles[3][2].car;
        let car_right = grid.tiles[3][4].car;
        if (THINGY > .5) {
            return (car_top !== null && car_right !== null && car_top === car_right) || (car_bot !== null && car_left !== null && car_bot === car_left)
        } else {
            return (car_top !== null && car_left !== null && car_top === car_left) || (car_bot !== null && car_right !== null && car_bot === car_right)
        }
    }
}

let debug_thing: Frame | null = null;

// do a single main loop step and request the next step
function step() {
    // start a new frame and clear screen
    Shaku.startFrame();
    Shaku.gfx!.clear(Shaku.utils.Color.cornflowerblue);

    // TODO: PUT YOUR GAME UPDATES / RENDERING HERE

    if (dragging === null) {
        if (!specialTileInUse()) {
            if (input.keyDown(KeyboardKeys.down)) {
                THINGY = 0;
                cars.forEach(c => c.recalcStuff());

            } else if (input.keyDown(KeyboardKeys.right)) {
                THINGY = 1;
                cars.forEach(c => c.recalcStuff());
            } else if (input.keyDown(KeyboardKeys.left)) {
                THINGY = -1;
                cars.forEach(c => c.recalcStuff());
            }
        }
        if (input.mousePressed()) {
            let grabbed_frame = grid.screen2frame(input.mousePosition);
            if (grabbed_frame !== null && grabbed_frame.tile.car !== null) {
                let car = grabbed_frame.tile.car;
                let segment = 0;
                let car_head = car.head.clone();
                while (car_head.tile != grabbed_frame.tile) {
                    segment++;
                    car_head.move(2, 1.0);
                }
                grabbed_frame.redir(car_head.dir);
                let offset = grabbed_frame.pos.x - .5;

                dragging = {
                    car: car,
                    total_offset: offset - segment,
                }
            }
        }
    } else {
        if (input.mouseReleased()) {
            new Animator(dragging.car).to({ "offset": 0 }).duration(.1).play();
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
            /*if (dragging.car.head.tile === grid.tiles[3][3]) {
                console.log("no!");
            }*/
            // console.log(dragging.car.head.dir);
            // console.log(cars[0].head);
            // dragging.car.addOffset(4 * Shaku.gameTime.delta * ((input.keyDown(KeyboardKeys.d) ? 1 : 0) - (input.keyDown(KeyboardKeys.a) ? 1 : 0)));
        }
    }

    if (input.keyPressed(KeyboardKeys.g)) {
        // console.log(grid.screen2frame(input.mousePosition));
        console.log(grid.tiles[0][0].invBilinear(input.mousePosition));
        debug_thing = grid.screen2frame(input.mousePosition);
    }

    for (let j = 0; j <= grid.h; j++) {
        for (let i = 0; i <= grid.w; i++) {
            grid.corners[j][i].updatePos();
        }
    }

    // Shaku.gfx.drawSprite(magic_sprite);
    grid.draw();

    cars.forEach(c => c.draw());

    if (debug_thing) {
        gfx.fillCircle(new Circle(grid.frame2screen(debug_thing), TILE_SIZE / 5), Color.black);
    }

    // cars[0].offset += .1 * Shaku.gameTime.delta;

    // end frame and request next step
    Shaku.endFrame();
    Shaku.requestAnimationFrame(step);
}

let hola = Shaku!.gfx!.canvas;
console.log(hola);

// console.log(Shaku)

// start main loop
step();


async function loadAsciiTexture(ascii: string, colors: (string | Color)[]): Promise<TextureAsset> {

    let rows = ascii.trim().split("\n").map(x => x.trim())
    console.log(rows)
    let height = rows.length
    let width = rows[0].length

    // create render target
    // @ts-ignore
    let renderTarget = await Shaku.assets.createRenderTarget(null, width, height, 4);

    // use render target
    Shaku.gfx!.setRenderTarget(renderTarget, false);

    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            let val = rows[j][i];
            if (val === '.' || val === ' ') continue;
            let n = parseInt(val);

            let col = colors[n];
            if (typeof col === 'string') {
                col = Shaku.utils.Color.fromHex(col);
            }
            Shaku.gfx!.fillRect(
                new Shaku.utils.Rectangle(i, height - j - 1, 1, 1),
                col,
                BlendModes.Opaque, 0
            );
        }
    }

    // reset render target
    // @ts-ignore
    Shaku.gfx!.setRenderTarget(null, false);

    return renderTarget;
}

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

function clamp(value: number, a: number, b: number) {
    if (value < a) return a;
    if (value > b) return b;
    return value;
}