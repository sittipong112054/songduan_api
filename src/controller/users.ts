import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { hashPassword, verifyPassword } from "../utils/password";
import { CreateUserDto } from "../models/user";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { conn } from "../lib/db";

const router = Router();
export default router;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

// ===== สร้างผู้ใช้ใหม่ =====
router.post(
    "/",
    asyncHandler(async (req, res) => {
        const body: CreateUserDto = req.body;
        const { role, phone, username, password, name, avatar_url } = body;

        if (!role || !["USER", "RIDER"].includes(role)) {
            return res.status(400).json({
                error: { code: "BAD_ROLE", message: "role ต้องเป็น USER หรือ RIDER" },
            });
        }
        if (!phone || !username || !password || !name) {
            return res.status(400).json({
                error: {
                    code: "MISSING",
                    message: "ต้องมี phone, username, password, name",
                },
            });
        }
        if (!USERNAME_RE.test(username)) {
            return res.status(400).json({
                error: {
                    code: "BAD_USERNAME",
                    message:
                        "username ต้องเป็น a-z, 0-9, _ ความยาว 3–30 ตัวอักษร",
                },
            });
        }

        const password_hash = await hashPassword(password);

        try {
            const [r] = await conn.execute<ResultSetHeader>(
                `INSERT INTO users(role, phone, username, password_hash, name, avatar_url)
         VALUES(?,?,?,?,?,?)`,
                [role, phone, username, password_hash, name, avatar_url || null]
            );
            const id = r.insertId;

            const [rows] = await conn.query<RowDataPacket[]>(
                `SELECT id, role, phone, username, name, avatar_url, created_at
           FROM users WHERE id=?`,
                [id]
            );
            res.status(201).json(rows[0]);
        } catch (err: any) {
            if (err?.code === "ER_DUP_ENTRY") {
                // ข้อความแยกเคสตามคีย์ที่ชน (phone/username)
                const msg =
                    (err.sqlMessage || "").includes("uniq_users_username") ||
                        (err.sqlMessage || "").includes("username")
                        ? { code: "USERNAME_TAKEN", message: "username นี้ถูกใช้แล้ว" }
                        : { code: "PHONE_TAKEN", message: "เบอร์นี้ถูกใช้แล้ว" };
                return res.status(409).json({ error: msg });
            }
            throw err;
        }
    })
);

// ===== เข้าสู่ระบบด้วย username หรือ phone =====
router.post(
    "/login",
    asyncHandler(async (req, res) => {
        const { identifier, password } = req.body as {
            identifier: string; // username หรือ phone
            password: string;
        };

        if (!identifier || !password) {
            return res.status(400).json({
                error: {
                    code: "MISSING",
                    message: "ต้องมี identifier (username หรือ phone), password",
                },
            });
        }

        // ถ้า identifier ตรงรูปแบบ username ให้ค้นด้วย username เป็นอันดับแรก
        const isUsernameLike = USERNAME_RE.test(identifier);

        let rows: RowDataPacket[];
        if (isUsernameLike) {
            [rows] = await conn.query<RowDataPacket[]>(
                `SELECT * FROM users WHERE username = ? LIMIT 1`,
                [identifier]
            );
            if (rows.length === 0) {
                // เผื่อผู้ใช้พิมพ์เบอร์ที่ดัน match regex ไม่ได้ ให้ลอง phone ซ้ำ
                [rows] = await conn.query<RowDataPacket[]>(
                    `SELECT * FROM users WHERE phone = ? LIMIT 1`,
                    [identifier]
                );
            }
        } else {
            // ดูเป็นเบอร์มากกว่า → ค้น phone ก่อน แล้วค่อย fallback ไป username
            [rows] = await conn.query<RowDataPacket[]>(
                `SELECT * FROM users WHERE phone = ? LIMIT 1`,
                [identifier]
            );
            if (rows.length === 0) {
                [rows] = await conn.query<RowDataPacket[]>(
                    `SELECT * FROM users WHERE username = ? LIMIT 1`,
                    [identifier]
                );
            }
        }

        const user: any = rows[0];
        if (!user) {
            return res.status(401).json({
                error: {
                    code: "INVALID_CREDENTIALS",
                    message: "ชื่อผู้ใช้/เบอร์ หรือรหัสผ่านไม่ถูกต้อง",
                },
            });
        }

        const ok = await verifyPassword(password, user.password_hash);
        if (!ok) {
            return res.status(401).json({
                error: {
                    code: "INVALID_CREDENTIALS",
                    message: "ชื่อผู้ใช้/เบอร์ หรือรหัสผ่านไม่ถูกต้อง",
                },
            });
        }

        delete user.password_hash;
        res.json({
            id: user.id,
            role: user.role,
            phone: user.phone,
            username: user.username,
            name: user.name,
            avatar_url: user.avatar_url,
            created_at: user.created_at,
            updated_at: user.updated_at,
        });
    })
);

// ===== อ่านผู้ใช้ =====
router.get(
    "/:id",
    asyncHandler(async (req, res) => {
        const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT id, role, phone, username, name, avatar_url, created_at, updated_at
         FROM users WHERE id=?`,
            [req.params.id]
        );
        if ((rows as any).length === 0) {
            return res
                .status(404)
                .json({ error: { code: "NOT_FOUND", message: "ไม่พบผู้ใช้" } });
        }
        res.json((rows as any)[0]);
    })
);

