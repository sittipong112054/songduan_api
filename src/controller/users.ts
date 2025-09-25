import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { hashPassword, verifyPassword } from "../utils/password";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { conn } from "../lib/db";
import { uploadMedia } from "../lib/upload";
import fs from "fs";

const router = Router();
export default router;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

// ===== สมัครสมาชิกแบบ member =====
router.post(
    "/members",
    uploadMedia.single("avatarFile"),
    asyncHandler(async (req, res) => {
        // body fields จากฟอร์ม
        const body = req.body as any; // multipart form fields
        const {
            username,
            password,
            role,
            name,
            phone,
            placeName,
            address,
            lat,
            lng,
        } = body;

        // validate ขั้นต้น
        if (role !== "MEMBER") {
            return res.status(400).json({
                error: { code: "BAD_ROLE", message: "role ต้องเป็น MEMBER สำหรับ endpoint นี้" },
            });
        }
        if (!username || !password || !name || !phone || !address || !placeName) {
            return res.status(400).json({
                error: { code: "MISSING", message: "ต้องมี username, password, name, phone, placeName, address" },
            });
        }
        if (!USERNAME_RE.test(username)) {
            return res.status(400).json({
                error: { code: "BAD_USERNAME", message: "username ต้องเป็น a-z, 0-9, _ ความยาว 3–30 ตัวอักษร" },
            });
        }
        const latNum = Number(lat);
        const lngNum = Number(lng);
        if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
            return res.status(400).json({
                error: { code: "BAD_COORDS", message: "lat/lng ต้องเป็นตัวเลข" },
            });
        }
        if (!req.file) {
            return res.status(400).json({
                error: { code: "MISSING_AVATAR", message: "ต้องอัปโหลดรูปโปรไฟล์" },
            });
        }


        const avatar_path = req.file ? `/uploads/avatars/${req.file.filename}` : null;
        const password_hash = await hashPassword(password);

        const connTx = await conn.getConnection();
        try {
            await connTx.beginTransaction();

            const [r] = await connTx.execute<ResultSetHeader>(
                `INSERT INTO users(role, phone, username, password_hash, name, avatar_path)
         VALUES(?,?,?,?,?,?)`,
                ["MEMBER", phone, username, password_hash, name, avatar_path]
            );
            const userId = r.insertId;

            await connTx.execute<ResultSetHeader>(
                `INSERT INTO addresses(user_id, label, address_text, lat, lng, is_default)
         VALUES(?,?,?,?,?,1)`,
                [userId, placeName, address, latNum, lngNum]
            );

            // ส่งข้อมูลกลับ
            const [rows] = await connTx.query<RowDataPacket[]>(
                `SELECT id, role, phone, username, name, avatar_path, created_at, updated_at
         FROM users WHERE id=?`,
                [userId]
            );

            await connTx.commit();
            return res.status(201).json({
                ...rows[0],
                default_address: {
                    label: placeName,
                    address_text: address,
                    lat: latNum,
                    lng: lngNum,
                    is_default: 1,
                },
            });
        } catch (err: any) {
            await connTx.rollback();

            if (req.file) fs.unlink(req.file.path, () => { });

            if (err?.code === "ER_DUP_ENTRY") {
                const msg =
                    (err.sqlMessage || "").includes("uniq_users_username") ||
                        (err.sqlMessage || "").includes("username")
                        ? { code: "USERNAME_TAKEN", message: "username นี้ถูกใช้แล้ว" }
                        : { code: "PHONE_TAKEN", message: "เบอร์นี้ถูกใช้แล้ว" };
                return res.status(409).json({ error: msg });
            }
            throw err;
        } finally {
            connTx.release();
        }
    })
);


// ===== สมัครสมาชิกแบบ Rider =====
router.post(
    "/riders",
    uploadMedia.fields([
        { name: "avatarFile", maxCount: 1 },
        { name: "vehiclePhotoFile", maxCount: 1 },
    ]),
    asyncHandler(async (req, res) => {
        const {
            username,
            password,
            role,
            name,
            phone,
            vehicle_plate,
            vehicle_model,       // optional
            vehicle_photo_path,  // optional: ถ้าส่งเป็น URL/พาธมา
        } = req.body as Record<string, string>;

        // 1) Validate อินพุต
        if (role !== "RIDER") {
            return res
                .status(400)
                .json({ error: { code: "BAD_ROLE", message: "role ต้องเป็น RIDER" } });
        }
        if (!username || !password || !name || !phone || !vehicle_plate) {
            return res.status(400).json({
                error: {
                    code: "MISSING",
                    message:
                        "ต้องมี username, password, name, phone, vehicle_plate อย่างน้อย",
                },
            });
        }
        if (!USERNAME_RE.test(username)) {
            return res.status(400).json({
                error: {
                    code: "BAD_USERNAME",
                    message: "username ต้องเป็น a-z, 0-9, _ ความยาว 3–30 ตัวอักษร",
                },
            });
        }

        // รูปจากไฟล์ (ถ้ามี)
        const avatar_path =
            (req.files as any)?.avatarFile?.[0]
                ? `/uploads/avatars/${(req.files as any).avatarFile[0].filename}`
                : null;

        // vehicle photo: ถ้าส่งไฟล์มาก็ใช้ไฟล์, ไม่งั้นถ้ามี vehicle_photo_path เป็นสตริงก็เก็บตามนั้น
        const vehicle_photo_path_final =
            (req.files as any)?.vehiclePhotoFile?.[0]
                ? `/uploads/vehicles/${(req.files as any).vehiclePhotoFile[0].filename}`
                : vehicle_photo_path || null;

        const password_hash = await hashPassword(password);

        // 2) Transaction
        const tx = await conn.getConnection();
        try {
            await tx.beginTransaction();

            // Users
            const [u] = await tx.execute<ResultSetHeader>(
                `INSERT INTO users (role, phone, username, password_hash, name, avatar_path)
         VALUES (?,?,?,?,?,?)`,
                ["RIDER", phone.trim(), username.trim(), password_hash, name.trim(), avatar_path]
            );
            const userId = u.insertId;

            // Rider Profiles
            await tx.execute<ResultSetHeader>(
                `INSERT INTO rider_profiles (user_id, vehicle_plate, vehicle_model, vehicle_photo_path, is_active)
         VALUES (?,?,?,?,1)`,
                [
                    userId,
                    vehicle_plate.trim(),
                    (vehicle_model || null)?.toString().trim() || null,
                    vehicle_photo_path_final,
                ]
            );

            // อ่านข้อมูลตอบกลับ
            const [[user]]: any = await tx.query<RowDataPacket[]>(
                `SELECT id, role, phone, username, name, avatar_path, created_at, updated_at
         FROM users WHERE id = ?`,
                [userId]
            );
            const [[profile]]: any = await tx.query<RowDataPacket[]>(
                `SELECT user_id, vehicle_plate, vehicle_model, vehicle_photo_path, is_active
         FROM rider_profiles WHERE user_id = ?`,
                [userId]
            );

            await tx.commit();
            return res.status(201).json({
                ...user,
                rider_profile: profile,
            });
        } catch (err: any) {
            await tx.rollback();

            // แยกเคสชน unique แบบแม่น ๆ
            if (err?.code === "ER_DUP_ENTRY") {
                const msg = (err.sqlMessage || "");
                if (msg.includes("uniq_users_username") || msg.includes("username")) {
                    return res
                        .status(409)
                        .json({ error: { code: "USERNAME_TAKEN", message: "username นี้ถูกใช้แล้ว" } });
                }
                if (msg.includes("uniq_users_phone") || msg.includes("phone")) {
                    return res
                        .status(409)
                        .json({ error: { code: "PHONE_TAKEN", message: "เบอร์นี้ถูกใช้แล้ว" } });
                }
                if (msg.includes("uniq_vehicle_plate") || msg.includes("vehicle_plate")) {
                    return res
                        .status(409)
                        .json({ error: { code: "VEHICLE_PLATE_TAKEN", message: "ทะเบียนรถนี้ถูกใช้แล้ว" } });
                }
            }
            throw err;
        } finally {
            tx.release();
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
            avatar_path: user.avatar_path,
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
            `SELECT id, role, phone, username, name, avatar_path, created_at, updated_at
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

