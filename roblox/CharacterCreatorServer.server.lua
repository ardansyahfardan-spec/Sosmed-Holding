-- GHOUSTORY: DESA TERLARANG
-- Character Creator bridge — place this Script in ServerScriptService.
-- Enable Game Settings > Security > Allow HTTP Requests before testing.

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")

local FUNCTION_URL = "https://xnbqckfbrrmdjiemfwqf.supabase.co/functions/v1/ghoustory-character"
local PUBLISHABLE_KEY = "sb_publishable_sQ_aA1vmVTuN5BlASN5Tsw_v2NaGbNL"
local LINK_COMMAND = "!ghlink "

local function request(payload)
	local ok, response = pcall(function()
		return HttpService:RequestAsync({
			Url = FUNCTION_URL,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["apikey"] = PUBLISHABLE_KEY,
			},
			Body = HttpService:JSONEncode(payload),
		})
	end)
	if not ok then
		warn("[Ghoustory Character] HTTP request failed:", response)
		return nil
	end
	if not response.Success then
		warn("[Ghoustory Character] API error:", response.StatusCode, response.Body)
		return nil
	end
	local decodedOk, decoded = pcall(function()
		return HttpService:JSONDecode(response.Body)
	end)
	if not decodedOk then
		warn("[Ghoustory Character] Invalid API response")
		return nil
	end
	return decoded
end

local function colorFromHex(hex, fallback)
	if typeof(hex) ~= "string" or not hex:match("^#?%x%x%x%x%x%x$") then
		return fallback
	end
	hex = hex:gsub("#", "")
	local r = tonumber(hex:sub(1, 2), 16)
	local g = tonumber(hex:sub(3, 4), 16)
	local b = tonumber(hex:sub(5, 6), 16)
	return Color3.fromRGB(r, g, b)
end

local function addWeldedPart(folder, head, name, size, offset, color, shape)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.Color = color
	part.Material = Enum.Material.SmoothPlastic
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.Massless = true
	part.Anchored = false
	if shape then part.Shape = shape end
	part.CFrame = head.CFrame * offset
	part.Parent = folder
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = head
	weld.Part1 = part
	weld.Parent = part
	return part
end

local function addHair(folder, head, style, color)
	if style == "bald" then return end
	addWeldedPart(folder, head, "HairCap", Vector3.new(1.75, 0.58, 1.48), CFrame.new(0, 0.29, 0.02), color, Enum.PartType.Ball)
	if style == "long" then
		addWeldedPart(folder, head, "LongHairLeft", Vector3.new(0.32, 1.25, 0.38), CFrame.new(-0.68, -0.42, 0.02), color)
		addWeldedPart(folder, head, "LongHairRight", Vector3.new(0.32, 1.25, 0.38), CFrame.new(0.68, -0.42, 0.02), color)
	elseif style == "fringe" then
		addWeldedPart(folder, head, "SideFringe", Vector3.new(0.62, 0.22, 0.22), CFrame.new(0.25, 0.14, -0.69) * CFrame.Angles(0, 0, math.rad(-18)), color)
	elseif style == "curly" then
		for i = 1, 7 do
			local angle = (math.pi * 2 / 7) * i
			local offset = CFrame.new(math.cos(angle) * 0.66, 0.15, math.sin(angle) * 0.62)
			addWeldedPart(folder, head, "Curl" .. i, Vector3.new(0.38, 0.38, 0.38), offset, color, Enum.PartType.Ball)
		end
	elseif style == "spiky" then
		for i = 1, 5 do
			local x = -0.55 + (i - 1) * 0.275
			local spike = addWeldedPart(folder, head, "HairSpike" .. i, Vector3.new(0.28, 0.62, 0.28), CFrame.new(x, 0.62, 0), color)
			spike.Shape = Enum.PartType.Wedge
			spike.CFrame = spike.CFrame * CFrame.Angles(0, 0, math.rad((i - 3) * -10))
		end
	else
		addWeldedPart(folder, head, "FrontHair", Vector3.new(0.9, 0.2, 0.22), CFrame.new(0, 0.08, -0.68), color)
	end
end

local function addAccessory(folder, head, accessory)
	local dark = Color3.fromRGB(25, 30, 42)
	if accessory == "glasses" then
		for _, x in ipairs({-0.27, 0.27}) do
			addWeldedPart(folder, head, "GlassesFrame", Vector3.new(0.34, 0.22, 0.07), CFrame.new(x, 0.02, -0.72), dark)
		end
		addWeldedPart(folder, head, "GlassesBridge", Vector3.new(0.2, 0.05, 0.06), CFrame.new(0, 0.02, -0.73), dark)
	elseif accessory == "cap" then
		addWeldedPart(folder, head, "Cap", Vector3.new(1.85, 0.38, 1.55), CFrame.new(0, 0.43, 0.02), Color3.fromRGB(36, 54, 75), Enum.PartType.Ball)
		addWeldedPart(folder, head, "CapBrim", Vector3.new(1.2, 0.08, 0.65), CFrame.new(0, 0.22, -0.7), Color3.fromRGB(51, 65, 85))
	elseif accessory == "headphones" then
		addWeldedPart(folder, head, "HeadphoneBand", Vector3.new(1.65, 0.12, 0.14), CFrame.new(0, 0.47, 0.05), Color3.fromRGB(100, 116, 139))
		addWeldedPart(folder, head, "HeadphoneLeft", Vector3.new(0.2, 0.48, 0.25), CFrame.new(-0.78, 0, 0), Color3.fromRGB(51, 65, 85))
		addWeldedPart(folder, head, "HeadphoneRight", Vector3.new(0.2, 0.48, 0.25), CFrame.new(0.78, 0, 0), Color3.fromRGB(51, 65, 85))
	end
end

local function applyAppearance(player, profile)
	local character = player.Character
	if not character then return end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local head = character:FindFirstChild("Head")
	if not humanoid or not head then return end

	local appearance = profile.appearance or {}
	local skin = colorFromHex(appearance.skin, Color3.fromRGB(184, 121, 85))
	local hairColor = colorFromHex(appearance.hairColor, Color3.fromRGB(23, 23, 23))
	local shirtColor = colorFromHex(appearance.shirt, Color3.fromRGB(127, 29, 29))
	local pantsColor = colorFromHex(appearance.pants, Color3.fromRGB(32, 38, 56))

	local bodyColors = character:FindFirstChildOfClass("BodyColors") or Instance.new("BodyColors")
	bodyColors.HeadColor3 = skin
	bodyColors.LeftArmColor3 = skin
	bodyColors.RightArmColor3 = skin
	bodyColors.LeftLegColor3 = pantsColor
	bodyColors.RightLegColor3 = pantsColor
	bodyColors.TorsoColor3 = shirtColor
	bodyColors.Parent = character

	for _, object in ipairs(character:GetChildren()) do
		if object.Name == "GhoustoryCustomAppearance" then object:Destroy() end
	end
	local custom = Instance.new("Folder")
	custom.Name = "GhoustoryCustomAppearance"
	custom.Parent = character
	addHair(custom, head, appearance.hair or "classic", hairColor)
	addAccessory(custom, head, appearance.accessory or "none")

	character:SetAttribute("GhoustoryCharacterName", profile.displayName or "Karakter Saya")
	character:SetAttribute("GhoustoryCharacterUpdatedAt", profile.updatedAt or "")
	print("[Ghoustory Character] Applied saved appearance for", player.Name)
end

local function loadPlayerCharacter(player)
	local profile = request({
		action = "get_character",
		robloxUserId = tostring(player.UserId),
	})
	if profile and profile.linked and profile.hasCharacter then
		applyAppearance(player, profile)
	end
end

local function linkPlayer(player, code)
	local result = request({
		action = "claim",
		code = code,
		robloxUserId = tostring(player.UserId),
	})
	if result and result.success then
		print("[Ghoustory Character] Roblox account linked for", player.Name)
		task.wait(0.5)
		loadPlayerCharacter(player)
	else
		warn("[Ghoustory Character] Could not link Roblox account for", player.Name, result and result.error)
	end
end

Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(function()
		task.wait(1.5)
		loadPlayerCharacter(player)
	end)
	player.Chatted:Connect(function(message)
		local lowered = message:lower()
		if lowered:sub(1, #LINK_COMMAND) == LINK_COMMAND then
			local code = message:sub(#LINK_COMMAND + 1):gsub("%s+", ""):upper()
			if #code == 10 then
				linkPlayer(player, code)
			else
				warn("[Ghoustory Character] Pairing code must contain 10 characters.")
			end
		end
	end)
end)

print("[Ghoustory Character] Roblox bridge is running. Use !ghlink YOURCODE in chat to link an account.")
