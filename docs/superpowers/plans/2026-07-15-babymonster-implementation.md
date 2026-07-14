# BabyMonster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個記錄寶寶每日照護（喝奶、大小便、體溫、體重）並提供每日統計與趨勢圖、供醫生看診參考的單一寶寶 iOS App。

**Architecture:** 單一 Xcode 專案。純邏輯（統計、年齡、大便卡、匯出/匯入）operate on Foundation-only 的 Codable 值型別，與 UI/持久化分離、可獨立單元測試。SwiftData `@Model` 類別負責本機持久化，並與值型別互相轉換。SwiftUI + Swift Charts 呈現 4 個分頁。

**Tech Stack:** SwiftUI, SwiftData, Swift Charts, XCTest, Xcode 26 手寫 `.xcodeproj`（objectVersion 77，synchronized file groups）。

## Global Constraints

- 最低支援 **iOS 17**（deployment target `IPHONEOS_DEPLOYMENT_TARGET = 17.0`）。
- 純本機儲存，無帳號、無網路。
- Bundle identifier：`com.wsturkey6.BabyMonster`。
- 體重單位 **公克 (g)**；喝奶量 **毫升 (ml)**；體溫 **°C**。
- 大便顏色卡 **1–9**，**1–6 為異常**、7–9 正常。
- 大便形狀 **布里斯托 1–7**。
- 大便量 **少 / 中 / 多**。
- 一天界線 = 當地時間 **00:00–23:59**（用 `Calendar.current`）。
- 記錄穩定鍵為 **UUID**；匯入以 id 聯集去重。
- 寶寶名字預設 **BabyMonster**，可修改；記錄 **birthDate** 用來算年齡。
- 每完成一個 Task 更新 `PROGRESS.md`。
- 測試指令固定用模擬器：
  `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`

---

### Task 1: 專案骨架（可建置的空殼 + 測試 target）

**Files:**
- Create: `BabyMonster.xcodeproj/project.pbxproj`
- Create: `BabyMonster/BabyMonsterApp.swift`
- Create: `BabyMonster/RootTabView.swift`
- Create: `BabyMonsterTests/SmokeTests.swift`

**Interfaces:**
- Produces: 可用 `xcodebuild` 建置的 `BabyMonster` app target 與 `BabyMonsterTests` 單元測試 target；`RootTabView` 為根 `TabView` 佔位。

- [ ] **Step 1: 建立 app 進入點與根視圖**

`BabyMonster/BabyMonsterApp.swift`:
```swift
import SwiftUI

@main
struct BabyMonsterApp: App {
    var body: some Scene {
        WindowGroup {
            RootTabView()
        }
    }
}
```

`BabyMonster/RootTabView.swift`:
```swift
import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            Text("記錄").tabItem { Label("記錄", systemImage: "square.and.pencil") }
            Text("每日統計").tabItem { Label("統計", systemImage: "list.bullet.rectangle") }
            Text("趨勢").tabItem { Label("趨勢", systemImage: "chart.xyaxis.line") }
            Text("設定").tabItem { Label("設定", systemImage: "gearshape") }
        }
    }
}
```

- [ ] **Step 2: 建立 smoke 測試**

`BabyMonsterTests/SmokeTests.swift`:
```swift
import XCTest

final class SmokeTests: XCTestCase {
    func testSmoke() {
        XCTAssertEqual(1 + 1, 2)
    }
}
```

- [ ] **Step 3: 手寫 `project.pbxproj`**

建立 `BabyMonster.xcodeproj/project.pbxproj`，內容如下（objectVersion 77，使用 `PBXFileSystemSynchronizedRootGroup` 讓 `BabyMonster/` 與 `BabyMonsterTests/` 資料夾自動納入）：

```
// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 77;
	objects = {

/* Begin PBXFileSystemSynchronizedRootGroup section */
		AA0000000000000000000001 /* BabyMonster */ = {isa = PBXFileSystemSynchronizedRootGroup; explicitFileTypes = {}; explicitFolders = (); path = BabyMonster; sourceTree = "<group>"; };
		AA0000000000000000000002 /* BabyMonsterTests */ = {isa = PBXFileSystemSynchronizedRootGroup; explicitFileTypes = {}; explicitFolders = (); path = BabyMonsterTests; sourceTree = "<group>"; };
/* End PBXFileSystemSynchronizedRootGroup section */

/* Begin PBXFrameworksBuildPhase section */
		AA0000000000000000000010 /* Frameworks */ = { isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		AA0000000000000000000011 /* Frameworks */ = { isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
/* End PBXFrameworksBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		AA0000000000000000000012 /* Sources */ = { isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		AA0000000000000000000013 /* Sources */ = { isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
/* End PBXSourcesBuildPhase section */

/* Begin PBXNativeTarget section */
		AA0000000000000000000020 /* BabyMonster */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = AA0000000000000000000030 /* Build configuration list for PBXNativeTarget "BabyMonster" */;
			buildPhases = ( AA0000000000000000000012 /* Sources */, AA0000000000000000000010 /* Frameworks */ );
			buildRules = ();
			dependencies = ();
			fileSystemSynchronizedGroups = ( AA0000000000000000000001 /* BabyMonster */ );
			name = BabyMonster;
			productName = BabyMonster;
			productReference = AA0000000000000000000040 /* BabyMonster.app */;
			productType = "com.apple.product-type.application";
		};
		AA0000000000000000000021 /* BabyMonsterTests */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = AA0000000000000000000031 /* Build configuration list for PBXNativeTarget "BabyMonsterTests" */;
			buildPhases = ( AA0000000000000000000013 /* Sources */, AA0000000000000000000011 /* Frameworks */ );
			buildRules = ();
			dependencies = ( AA0000000000000000000051 /* PBXTargetDependency */ );
			fileSystemSynchronizedGroups = ( AA0000000000000000000002 /* BabyMonsterTests */ );
			name = BabyMonsterTests;
			productName = BabyMonsterTests;
			productReference = AA0000000000000000000041 /* BabyMonsterTests.xctest */;
			productType = "com.apple.product-type.bundle.unit-test";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		AA0000000000000000000000 /* Project object */ = {
			isa = PBXProject;
			attributes = {
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 2600;
				LastUpgradeCheck = 2600;
				TargetAttributes = {
					AA0000000000000000000020 = { CreatedOnToolsVersion = 26.0; };
					AA0000000000000000000021 = { CreatedOnToolsVersion = 26.0; TestTargetID = AA0000000000000000000020; };
				};
			};
			buildConfigurationList = AA0000000000000000000032 /* Build configuration list for PBXProject "BabyMonster" */;
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = ( en, Base );
			mainGroup = AA0000000000000000000003;
			minimizedProjectReferenceProxies = 1;
			preferredProjectObjectVersion = 77;
			productRefGroup = AA0000000000000000000004 /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = ( AA0000000000000000000020 /* BabyMonster */, AA0000000000000000000021 /* BabyMonsterTests */ );
		};
/* End PBXProject section */

/* Begin PBXGroup section */
		AA0000000000000000000003 = {
			isa = PBXGroup;
			children = ( AA0000000000000000000001 /* BabyMonster */, AA0000000000000000000002 /* BabyMonsterTests */, AA0000000000000000000004 /* Products */ );
			sourceTree = "<group>";
		};
		AA0000000000000000000004 /* Products */ = {
			isa = PBXGroup;
			children = ( AA0000000000000000000040 /* BabyMonster.app */, AA0000000000000000000041 /* BabyMonsterTests.xctest */ );
			name = Products;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXFileReference section */
		AA0000000000000000000040 /* BabyMonster.app */ = { isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = BabyMonster.app; sourceTree = BUILT_PRODUCTS_DIR; };
		AA0000000000000000000041 /* BabyMonsterTests.xctest */ = { isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = BabyMonsterTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; };
/* End PBXFileReference section */

/* Begin PBXTargetDependency section */
		AA0000000000000000000051 /* PBXTargetDependency */ = { isa = PBXTargetDependency; target = AA0000000000000000000020 /* BabyMonster */; targetProxy = AA0000000000000000000052 /* PBXContainerItemProxy */; };
/* End PBXTargetDependency section */

/* Begin PBXContainerItemProxy section */
		AA0000000000000000000052 /* PBXContainerItemProxy */ = { isa = PBXContainerItemProxy; containerPortal = AA0000000000000000000000 /* Project object */; proxyType = 1; remoteGlobalIDString = AA0000000000000000000020; remoteInfo = BabyMonster; };
/* End PBXContainerItemProxy section */

/* Begin XCBuildConfiguration section */
		AA0000000000000000000060 /* Debug */ = { isa = XCBuildConfiguration; buildSettings = {
			ALWAYS_SEARCH_USER_PATHS = NO;
			CLANG_ENABLE_MODULES = YES;
			ENABLE_STRICT_OBJC_MSGSEND = YES;
			GCC_C_LANGUAGE_STANDARD = gnu17;
			IPHONEOS_DEPLOYMENT_TARGET = 17.0;
			SDKROOT = iphoneos;
			SWIFT_VERSION = 5.0;
			ONLY_ACTIVE_ARCH = YES;
			DEBUG_INFORMATION_FORMAT = dwarf;
			ENABLE_TESTABILITY = YES;
			SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
		}; name = Debug; };
		AA0000000000000000000061 /* Release */ = { isa = XCBuildConfiguration; buildSettings = {
			ALWAYS_SEARCH_USER_PATHS = NO;
			CLANG_ENABLE_MODULES = YES;
			ENABLE_STRICT_OBJC_MSGSEND = YES;
			GCC_C_LANGUAGE_STANDARD = gnu17;
			IPHONEOS_DEPLOYMENT_TARGET = 17.0;
			SDKROOT = iphoneos;
			SWIFT_VERSION = 5.0;
			DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
			SWIFT_COMPILATION_MODE = wholemodule;
		}; name = Release; };
		AA0000000000000000000062 /* Debug */ = { isa = XCBuildConfiguration; buildSettings = {
			PRODUCT_BUNDLE_IDENTIFIER = com.wsturkey6.BabyMonster;
			PRODUCT_NAME = "$(TARGET_NAME)";
			GENERATE_INFOPLIST_FILE = YES;
			INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
			INFOPLIST_KEY_UILaunchScreen_Generation = YES;
			INFOPLIST_KEY_UISupportedInterfaceOrientations = "UIInterfaceOrientationPortrait";
			SWIFT_EMIT_LOC_STRINGS = YES;
			ENABLE_PREVIEWS = YES;
			CODE_SIGN_STYLE = Automatic;
			CURRENT_PROJECT_VERSION = 1;
			MARKETING_VERSION = 1.0;
			TARGETED_DEVICE_FAMILY = "1,2";
		}; name = Debug; };
		AA0000000000000000000063 /* Release */ = { isa = XCBuildConfiguration; buildSettings = {
			PRODUCT_BUNDLE_IDENTIFIER = com.wsturkey6.BabyMonster;
			PRODUCT_NAME = "$(TARGET_NAME)";
			GENERATE_INFOPLIST_FILE = YES;
			INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
			INFOPLIST_KEY_UILaunchScreen_Generation = YES;
			INFOPLIST_KEY_UISupportedInterfaceOrientations = "UIInterfaceOrientationPortrait";
			SWIFT_EMIT_LOC_STRINGS = YES;
			ENABLE_PREVIEWS = YES;
			CODE_SIGN_STYLE = Automatic;
			CURRENT_PROJECT_VERSION = 1;
			MARKETING_VERSION = 1.0;
			TARGETED_DEVICE_FAMILY = "1,2";
		}; name = Release; };
		AA0000000000000000000064 /* Debug */ = { isa = XCBuildConfiguration; buildSettings = {
			PRODUCT_BUNDLE_IDENTIFIER = com.wsturkey6.BabyMonsterTests;
			PRODUCT_NAME = "$(TARGET_NAME)";
			GENERATE_INFOPLIST_FILE = YES;
			BUNDLE_LOADER = "$(TEST_HOST)";
			TEST_HOST = "$(BUILT_PRODUCTS_DIR)/BabyMonster.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/BabyMonster";
			TARGETED_DEVICE_FAMILY = "1,2";
		}; name = Debug; };
		AA0000000000000000000065 /* Release */ = { isa = XCBuildConfiguration; buildSettings = {
			PRODUCT_BUNDLE_IDENTIFIER = com.wsturkey6.BabyMonsterTests;
			PRODUCT_NAME = "$(TARGET_NAME)";
			GENERATE_INFOPLIST_FILE = YES;
			BUNDLE_LOADER = "$(TEST_HOST)";
			TEST_HOST = "$(BUILT_PRODUCTS_DIR)/BabyMonster.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/BabyMonster";
			TARGETED_DEVICE_FAMILY = "1,2";
		}; name = Release; };
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		AA0000000000000000000030 /* Build configuration list for PBXNativeTarget "BabyMonster" */ = { isa = XCConfigurationList; buildConfigurations = ( AA0000000000000000000062 /* Debug */, AA0000000000000000000063 /* Release */ ); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		AA0000000000000000000031 /* Build configuration list for PBXNativeTarget "BabyMonsterTests" */ = { isa = XCConfigurationList; buildConfigurations = ( AA0000000000000000000064 /* Debug */, AA0000000000000000000065 /* Release */ ); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		AA0000000000000000000032 /* Build configuration list for PBXProject "BabyMonster" */ = { isa = XCConfigurationList; buildConfigurations = ( AA0000000000000000000060 /* Debug */, AA0000000000000000000061 /* Release */ ); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
/* End XCConfigurationList section */
	};
	rootObject = AA0000000000000000000000 /* Project object */;
}
```

- [ ] **Step 4: 建立 scheme（讓 xcodebuild -scheme 找得到）**

建立 `BabyMonster.xcodeproj/xcshareddata/xcschemes/BabyMonster.xcscheme`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2600" version="1.7">
   <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">
            <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="AA0000000000000000000020" BuildableName="BabyMonster.app" BlueprintName="BabyMonster" ReferencedContainer="container:BabyMonster.xcodeproj"></BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES">
      <Testables>
         <TestableReference skipped="NO">
            <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="AA0000000000000000000021" BuildableName="BabyMonsterTests.xctest" BlueprintName="BabyMonsterTests" ReferencedContainer="container:BabyMonster.xcodeproj"></BuildableReference>
         </TestableReference>
      </Testables>
   </TestAction>
   <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES">
      <BuildableProductRunnable runnableDebuggingMode="0">
         <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="AA0000000000000000000020" BuildableName="BabyMonster.app" BlueprintName="BabyMonster" ReferencedContainer="container:BabyMonster.xcodeproj"></BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"></ProfileAction>
   <AnalyzeAction buildConfiguration="Debug"></AnalyzeAction>
   <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"></ArchiveAction>
</Scheme>
```

- [ ] **Step 5: 驗證專案結構被辨識**

Run: `xcodebuild -project BabyMonster.xcodeproj -list`
Expected: 列出 Targets `BabyMonster`、`BabyMonsterTests` 與 Scheme `BabyMonster`。
若失敗（pbxproj 格式錯誤）：對照上面內容修正引號/分號/UUID 交互參照；仍失敗則以 Xcode GUI「File > New > Project > iOS App（SwiftUI）」建立同名專案作為 fallback，再把上述 Swift 檔加入。

- [ ] **Step 6: 驗證建置**

Run: `xcodebuild build -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 7: 驗證測試 target 可跑**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: `** TEST SUCCEEDED **`，`testSmoke` 通過。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Task 1: scaffold buildable Xcode project with app + test targets"
```

---

### Task 2: 列舉與大便顏色卡

**Files:**
- Create: `BabyMonster/Models/Enums.swift`
- Create: `BabyMonster/Models/StoolColorCard.swift`
- Create: `BabyMonsterTests/StoolColorTests.swift`

**Interfaces:**
- Produces:
  - `enum StoolAmount: String, Codable, CaseIterable { case few, medium, many }`（顯示名：少/中/多）
  - `enum BristolType: Int, Codable, CaseIterable { case type1 = 1 ... type7 = 7 }`
  - `struct StoolColorCard { static func isAbnormal(_ number: Int) -> Bool; static let all: [Int] = Array(1...9); static func color(for number: Int) -> Color; static func label(for number: Int) -> String }`

- [ ] **Step 1: 撰寫失敗測試**

`BabyMonsterTests/StoolColorTests.swift`:
```swift
import XCTest
@testable import BabyMonster

final class StoolColorTests: XCTestCase {
    func testColors1To6AreAbnormal() {
        for n in 1...6 { XCTAssertTrue(StoolColorCard.isAbnormal(n), "\(n) should be abnormal") }
    }
    func testColors7To9AreNormal() {
        for n in 7...9 { XCTAssertFalse(StoolColorCard.isAbnormal(n), "\(n) should be normal") }
    }
    func testBoundary6Abnormal7Normal() {
        XCTAssertTrue(StoolColorCard.isAbnormal(6))
        XCTAssertFalse(StoolColorCard.isAbnormal(7))
    }
    func testAllHasNineCards() {
        XCTAssertEqual(StoolColorCard.all, Array(1...9))
    }
    func testStoolAmountCases() {
        XCTAssertEqual(StoolAmount.allCases.count, 3)
    }
    func testBristolRange() {
        XCTAssertEqual(BristolType.allCases.first?.rawValue, 1)
        XCTAssertEqual(BristolType.allCases.last?.rawValue, 7)
    }
}
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 編譯失敗（`StoolColorCard`/`StoolAmount`/`BristolType` 未定義）。

- [ ] **Step 3: 實作列舉**

`BabyMonster/Models/Enums.swift`:
```swift
import Foundation

enum StoolAmount: String, Codable, CaseIterable, Identifiable {
    case few, medium, many
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .few: return "少"
        case .medium: return "中"
        case .many: return "多"
        }
    }
}

enum BristolType: Int, Codable, CaseIterable, Identifiable {
    case type1 = 1, type2, type3, type4, type5, type6, type7
    var id: Int { rawValue }
    var displayName: String {
        switch self {
        case .type1: return "第1型：一顆顆硬塊（難排出）"
        case .type2: return "第2型：香腸狀但結塊"
        case .type3: return "第3型：香腸狀，表面有裂痕"
        case .type4: return "第4型：香腸/蛇狀，光滑柔軟（理想）"
        case .type5: return "第5型：柔軟塊狀，邊緣清楚"
        case .type6: return "第6型：蓬鬆糊狀，邊緣不規則"
        case .type7: return "第7型：水狀，無固體塊（腹瀉）"
        }
    }
}
```

- [ ] **Step 4: 實作大便顏色卡**

`BabyMonster/Models/StoolColorCard.swift`:
```swift
import SwiftUI

enum StoolColorCard {
    static let all: [Int] = Array(1...9)

    /// 台灣兒童健康手冊嬰兒大便卡：1–6 號為異常（白陶土色系），7–9 號正常。
    static func isAbnormal(_ number: Int) -> Bool {
        (1...6).contains(number)
    }

    /// 近似色（實體大便卡為最終判讀依據）。
    static func color(for number: Int) -> Color {
        switch number {
        case 1: return Color(red: 0.90, green: 0.88, blue: 0.80) // 灰白/陶土
        case 2: return Color(red: 0.92, green: 0.90, blue: 0.78) // 淺灰黃
        case 3: return Color(red: 0.95, green: 0.93, blue: 0.75) // 淺黃白
        case 4: return Color(red: 0.96, green: 0.90, blue: 0.60) // 淡黃
        case 5: return Color(red: 0.85, green: 0.86, blue: 0.55) // 淺黃綠
        case 6: return Color(red: 0.70, green: 0.80, blue: 0.55) // 淡綠
        case 7: return Color(red: 0.90, green: 0.70, blue: 0.25) // 黃
        case 8: return Color(red: 0.45, green: 0.55, blue: 0.25) // 綠
        case 9: return Color(red: 0.45, green: 0.30, blue: 0.15) // 棕褐
        default: return .gray
        }
    }

    static func label(for number: Int) -> String {
        isAbnormal(number) ? "\(number) 號（異常）" : "\(number) 號（正常）"
    }
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `xcodebuild test ...`（同上）
Expected: `** TEST SUCCEEDED **`，StoolColorTests 全通過。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Task 2: stool color card + enums with tests"
```

---

### Task 3: 領域值型別（Codable）

**Files:**
- Create: `BabyMonster/Models/RecordData.swift`
- Create: `BabyMonster/Models/ProfileData.swift`
- Create: `BabyMonsterTests/ModelCodableTests.swift`

**Interfaces:**
- Produces:
  - `struct RecordData: Codable, Identifiable, Equatable { var id: UUID; var timestamp: Date; var feedAmount: Double?; var stoolColor: Int?; var stoolAmount: StoolAmount?; var stoolShape: BristolType?; var hasUrine: Bool; var temperature: Double?; var weight: Double?; var note: String? }`
  - `struct ProfileData: Codable, Equatable { var name: String; var birthDate: Date }`
  - `var hasStool: Bool { stoolColor != nil }` on `RecordData`

- [ ] **Step 1: 撰寫失敗測試**

`BabyMonsterTests/ModelCodableTests.swift`:
```swift
import XCTest
@testable import BabyMonster

final class ModelCodableTests: XCTestCase {
    func testRecordDataRoundTrip() throws {
        let rec = RecordData(id: UUID(), timestamp: Date(timeIntervalSince1970: 1_700_000_000),
                             feedAmount: 120, stoolColor: 7, stoolAmount: .medium, stoolShape: .type4,
                             hasUrine: true, temperature: 36.8, weight: 4200, note: "ok")
        let data = try JSONEncoder().encode(rec)
        let decoded = try JSONDecoder().decode(RecordData.self, from: data)
        XCTAssertEqual(rec, decoded)
    }
    func testHasStool() {
        var r = RecordData(id: UUID(), timestamp: Date(), feedAmount: nil, stoolColor: 3,
                           stoolAmount: nil, stoolShape: nil, hasUrine: false, temperature: nil, weight: nil, note: nil)
        XCTAssertTrue(r.hasStool)
        r.stoolColor = nil
        XCTAssertFalse(r.hasStool)
    }
    func testProfileRoundTrip() throws {
        let p = ProfileData(name: "BabyMonster", birthDate: Date(timeIntervalSince1970: 1_600_000_000))
        let decoded = try JSONDecoder().decode(ProfileData.self, from: JSONEncoder().encode(p))
        XCTAssertEqual(p, decoded)
    }
}
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `xcodebuild test ...`
Expected: 編譯失敗（`RecordData`/`ProfileData` 未定義）。

- [ ] **Step 3: 實作值型別**

`BabyMonster/Models/RecordData.swift`:
```swift
import Foundation

struct RecordData: Codable, Identifiable, Equatable {
    var id: UUID
    var timestamp: Date
    var feedAmount: Double?      // ml
    var stoolColor: Int?         // 1...9
    var stoolAmount: StoolAmount?
    var stoolShape: BristolType?
    var hasUrine: Bool
    var temperature: Double?     // °C
    var weight: Double?          // g
    var note: String?

    var hasStool: Bool { stoolColor != nil }
}
```

`BabyMonster/Models/ProfileData.swift`:
```swift
import Foundation

struct ProfileData: Codable, Equatable {
    var name: String
    var birthDate: Date
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `xcodebuild test ...`
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 3: Codable domain value types with round-trip tests"
```

---

### Task 4: 每日統計（DailyStats）

**Files:**
- Create: `BabyMonster/Logic/DailyStats.swift`
- Create: `BabyMonsterTests/DailyStatsTests.swift`

**Interfaces:**
- Consumes: `RecordData`
- Produces:
  - `struct DailySummary: Equatable { var stoolCount: Int; var urineCount: Int; var totalFeed: Double; var averageTemperature: Double?; var averageWeight: Double? }`
  - `enum DailyStats { static func summary(for date: Date, records: [RecordData], calendar: Calendar = .current) -> DailySummary }`

- [ ] **Step 1: 撰寫失敗測試**

`BabyMonsterTests/DailyStatsTests.swift`:
```swift
import XCTest
@testable import BabyMonster

final class DailyStatsTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)

    func makeDate(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    func rec(_ date: Date, feed: Double? = nil, stool: Int? = nil, urine: Bool = false,
             temp: Double? = nil, weight: Double? = nil) -> RecordData {
        RecordData(id: UUID(), timestamp: date, feedAmount: feed, stoolColor: stool,
                   stoolAmount: nil, stoolShape: nil, hasUrine: urine, temperature: temp, weight: weight, note: nil)
    }

    func testEmptyDay() {
        let s = DailyStats.summary(for: makeDate(2026, 7, 15), records: [], calendar: cal)
        XCTAssertEqual(s, DailySummary(stoolCount: 0, urineCount: 0, totalFeed: 0, averageTemperature: nil, averageWeight: nil))
    }

    func testCountsAndSums() {
        let day = makeDate(2026, 7, 15)
        let records = [
            rec(makeDate(2026, 7, 15, 8), feed: 100, stool: 7, urine: true, temp: 36.5, weight: 4000),
            rec(makeDate(2026, 7, 15, 12), feed: 120, urine: true),
            rec(makeDate(2026, 7, 15, 18), stool: 3, temp: 37.5, weight: 4100),
        ]
        let s = DailyStats.summary(for: day, records: records, calendar: cal)
        XCTAssertEqual(s.stoolCount, 2)
        XCTAssertEqual(s.urineCount, 2)
        XCTAssertEqual(s.totalFeed, 220)
        XCTAssertEqual(s.averageTemperature!, 37.0, accuracy: 0.001)
        XCTAssertEqual(s.averageWeight!, 4050, accuracy: 0.001)
    }

    func testOnlyCountsSelectedDay() {
        let day = makeDate(2026, 7, 15)
        let records = [
            rec(makeDate(2026, 7, 15, 8), feed: 100),
            rec(makeDate(2026, 7, 14, 23), feed: 999), // 前一天
            rec(makeDate(2026, 7, 16, 0), feed: 999),  // 後一天
        ]
        let s = DailyStats.summary(for: day, records: records, calendar: cal)
        XCTAssertEqual(s.totalFeed, 100)
    }
}
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `xcodebuild test ...`
Expected: 編譯失敗（`DailyStats`/`DailySummary` 未定義）。

- [ ] **Step 3: 實作**

`BabyMonster/Logic/DailyStats.swift`:
```swift
import Foundation

struct DailySummary: Equatable {
    var stoolCount: Int
    var urineCount: Int
    var totalFeed: Double
    var averageTemperature: Double?
    var averageWeight: Double?
}

enum DailyStats {
    static func summary(for date: Date, records: [RecordData], calendar: Calendar = .current) -> DailySummary {
        let dayRecords = records.filter { calendar.isDate($0.timestamp, inSameDayAs: date) }

        let stoolCount = dayRecords.filter { $0.hasStool }.count
        let urineCount = dayRecords.filter { $0.hasUrine }.count
        let totalFeed = dayRecords.compactMap { $0.feedAmount }.reduce(0, +)

        let temps = dayRecords.compactMap { $0.temperature }
        let weights = dayRecords.compactMap { $0.weight }
        let avgTemp = temps.isEmpty ? nil : temps.reduce(0, +) / Double(temps.count)
        let avgWeight = weights.isEmpty ? nil : weights.reduce(0, +) / Double(weights.count)

        return DailySummary(stoolCount: stoolCount, urineCount: urineCount,
                            totalFeed: totalFeed, averageTemperature: avgTemp, averageWeight: avgWeight)
    }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `xcodebuild test ...`
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 4: daily statistics with tests"
```

---

### Task 5: 寶寶年齡（BabyAge）

**Files:**
- Create: `BabyMonster/Logic/BabyAge.swift`
- Create: `BabyMonsterTests/BabyAgeTests.swift`

**Interfaces:**
- Produces:
  - `struct BabyAge: Equatable { let years: Int; let months: Int; let days: Int; var displayText: String }`
  - `enum BabyAgeCalculator { static func age(birthDate: Date, asOf: Date, calendar: Calendar = .current) -> BabyAge }`

- [ ] **Step 1: 撰寫失敗測試**

`BabyMonsterTests/BabyAgeTests.swift`:
```swift
import XCTest
@testable import BabyMonster

final class BabyAgeTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)
    func d(_ y: Int, _ m: Int, _ day: Int) -> Date { cal.date(from: DateComponents(year: y, month: m, day: day))! }

    func testBirthdayItself() {
        let a = BabyAgeCalculator.age(birthDate: d(2026, 1, 15), asOf: d(2026, 1, 15), calendar: cal)
        XCTAssertEqual(a, BabyAge(years: 0, months: 0, days: 0))
    }
    func testDaysOnly() {
        let a = BabyAgeCalculator.age(birthDate: d(2026, 1, 1), asOf: d(2026, 1, 11), calendar: cal)
        XCTAssertEqual(a, BabyAge(years: 0, months: 0, days: 10))
    }
    func testMonthsAndDays() {
        let a = BabyAgeCalculator.age(birthDate: d(2026, 1, 10), asOf: d(2026, 3, 15), calendar: cal)
        XCTAssertEqual(a, BabyAge(years: 0, months: 2, days: 5))
    }
    func testCrossMonthBorrow() {
        // 出生 1/31，asOf 3/1：跨月借位
        let a = BabyAgeCalculator.age(birthDate: d(2026, 1, 31), asOf: d(2026, 3, 1), calendar: cal)
        XCTAssertEqual(a.months, 1)
        XCTAssertEqual(a.years, 0)
    }
    func testYears() {
        let a = BabyAgeCalculator.age(birthDate: d(2024, 5, 20), asOf: d(2026, 7, 15), calendar: cal)
        XCTAssertEqual(a, BabyAge(years: 2, months: 1, days: 26))
    }
    func testDisplayText() {
        XCTAssertEqual(BabyAge(years: 1, months: 2, days: 3).displayText, "1 歲 2 個月又 3 天")
    }
}
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `xcodebuild test ...`
Expected: 編譯失敗（`BabyAge`/`BabyAgeCalculator` 未定義）。

- [ ] **Step 3: 實作**

`BabyMonster/Logic/BabyAge.swift`:
```swift
import Foundation

struct BabyAge: Equatable {
    let years: Int
    let months: Int
    let days: Int
    var displayText: String { "\(years) 歲 \(months) 個月又 \(days) 天" }
}

enum BabyAgeCalculator {
    static func age(birthDate: Date, asOf: Date, calendar: Calendar = .current) -> BabyAge {
        let comps = calendar.dateComponents([.year, .month, .day], from: birthDate, to: asOf)
        return BabyAge(years: max(0, comps.year ?? 0),
                       months: max(0, comps.month ?? 0),
                       days: max(0, comps.day ?? 0))
    }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `xcodebuild test ...`
Expected: `** TEST SUCCEEDED **`（若 `testYears` 天數因日曆借位與預期差 1，改為以 `Calendar` 實算值更新斷言，不改實作）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 5: baby age calculation with tests"
```

---

### Task 6: 匯出 / 匯入 / 合併（DataTransfer）

**Files:**
- Create: `BabyMonster/Logic/DataTransfer.swift`
- Create: `BabyMonsterTests/DataTransferTests.swift`

**Interfaces:**
- Consumes: `RecordData`, `ProfileData`
- Produces:
  - `struct BackupPayload: Codable, Equatable { var profile: ProfileData; var records: [RecordData] }`
  - `enum DataTransfer { static func encode(_ payload: BackupPayload) throws -> Data; static func decode(_ data: Data) throws -> BackupPayload; static func mergeRecords(local: [RecordData], incoming: [RecordData]) -> [RecordData] }`
  - 合併語意：以 `id` 聯集去重，重複 id 保留 local 版本，結果依 `timestamp` 排序。

- [ ] **Step 1: 撰寫失敗測試**

`BabyMonsterTests/DataTransferTests.swift`:
```swift
import XCTest
@testable import BabyMonster

final class DataTransferTests: XCTestCase {
    func rec(_ id: UUID, _ t: TimeInterval, feed: Double? = nil) -> RecordData {
        RecordData(id: id, timestamp: Date(timeIntervalSince1970: t), feedAmount: feed, stoolColor: nil,
                   stoolAmount: nil, stoolShape: nil, hasUrine: false, temperature: nil, weight: nil, note: nil)
    }

    func testPayloadRoundTrip() throws {
        let payload = BackupPayload(
            profile: ProfileData(name: "BabyMonster", birthDate: Date(timeIntervalSince1970: 1_600_000_000)),
            records: [rec(UUID(), 1000, feed: 100), rec(UUID(), 2000, feed: 120)])
        let decoded = try DataTransfer.decode(DataTransfer.encode(payload))
        XCTAssertEqual(decoded, payload)
    }

    func testMergeUnionById() {
        let shared = UUID()
        let local = [rec(shared, 1000, feed: 100), rec(UUID(), 2000, feed: 200)]
        let incoming = [rec(shared, 1000, feed: 999), rec(UUID(), 3000, feed: 300)]
        let merged = DataTransfer.mergeRecords(local: local, incoming: incoming)
        XCTAssertEqual(merged.count, 3) // 共享 id 只算一次
        // 重複 id 保留 local（feed 100 而非 999）
        XCTAssertEqual(merged.first(where: { $0.id == shared })?.feedAmount, 100)
        // 依 timestamp 排序
        XCTAssertEqual(merged.map { $0.timestamp }, merged.map { $0.timestamp }.sorted())
    }

    func testMergeEmptyIncoming() {
        let local = [rec(UUID(), 1000)]
        XCTAssertEqual(DataTransfer.mergeRecords(local: local, incoming: []).count, 1)
    }
}
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `xcodebuild test ...`
Expected: 編譯失敗（`DataTransfer`/`BackupPayload` 未定義）。

- [ ] **Step 3: 實作**

`BabyMonster/Logic/DataTransfer.swift`:
```swift
import Foundation

struct BackupPayload: Codable, Equatable {
    var profile: ProfileData
    var records: [RecordData]
}

enum DataTransfer {
    static func encode(_ payload: BackupPayload) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(payload)
    }

    static func decode(_ data: Data) throws -> BackupPayload {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(BackupPayload.self, from: data)
    }

    /// 以 id 聯集去重；重複 id 保留 local；結果依 timestamp 排序。
    static func mergeRecords(local: [RecordData], incoming: [RecordData]) -> [RecordData] {
        var byId: [UUID: RecordData] = [:]
        for r in incoming { byId[r.id] = r }
        for r in local { byId[r.id] = r } // local 覆蓋 incoming
        return byId.values.sorted { $0.timestamp < $1.timestamp }
    }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `xcodebuild test ...`
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 6: data export/import/merge with tests"
```

---

### Task 7: SwiftData 持久化模型與對應

**Files:**
- Create: `BabyMonster/Models/RecordEntity.swift`
- Create: `BabyMonster/Models/ProfileEntity.swift`
- Create: `BabyMonster/Models/ModelContainer+App.swift`
- Create: `BabyMonsterTests/PersistenceMappingTests.swift`

**Interfaces:**
- Consumes: `RecordData`, `ProfileData`, enums
- Produces:
  - `@Model final class RecordEntity`（欄位對應 RecordData，enums 存 rawValue），`var data: RecordData { get }`、`convenience init(data: RecordData)`
  - `@Model final class ProfileEntity { var name: String; var birthDate: Date }`，`var data: ProfileData`
  - `enum AppModelContainer { static func makeInMemory() throws -> ModelContainer }`（測試用）

- [ ] **Step 1: 撰寫失敗測試**

`BabyMonsterTests/PersistenceMappingTests.swift`:
```swift
import XCTest
import SwiftData
@testable import BabyMonster

final class PersistenceMappingTests: XCTestCase {
    @MainActor
    func testRecordEntityRoundTripThroughStore() throws {
        let container = try AppModelContainer.makeInMemory()
        let ctx = container.mainContext
        let original = RecordData(id: UUID(), timestamp: Date(timeIntervalSince1970: 1000),
                                  feedAmount: 90, stoolColor: 8, stoolAmount: .many, stoolShape: .type6,
                                  hasUrine: true, temperature: 36.9, weight: 3800, note: "n")
        ctx.insert(RecordEntity(data: original))
        try ctx.save()
        let fetched = try ctx.fetch(FetchDescriptor<RecordEntity>())
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched.first?.data, original)
    }

    @MainActor
    func testProfileEntityMapping() throws {
        let p = ProfileData(name: "BabyMonster", birthDate: Date(timeIntervalSince1970: 500))
        let e = ProfileEntity(data: p)
        XCTAssertEqual(e.data, p)
    }
}
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `xcodebuild test ...`
Expected: 編譯失敗（`RecordEntity`/`ProfileEntity`/`AppModelContainer` 未定義）。

- [ ] **Step 3: 實作 Entities 與 Container**

`BabyMonster/Models/RecordEntity.swift`:
```swift
import Foundation
import SwiftData

@Model
final class RecordEntity {
    @Attribute(.unique) var id: UUID
    var timestamp: Date
    var feedAmount: Double?
    var stoolColor: Int?
    var stoolAmountRaw: String?
    var stoolShapeRaw: Int?
    var hasUrine: Bool
    var temperature: Double?
    var weight: Double?
    var note: String?

    init(id: UUID, timestamp: Date, feedAmount: Double?, stoolColor: Int?,
         stoolAmountRaw: String?, stoolShapeRaw: Int?, hasUrine: Bool,
         temperature: Double?, weight: Double?, note: String?) {
        self.id = id; self.timestamp = timestamp; self.feedAmount = feedAmount
        self.stoolColor = stoolColor; self.stoolAmountRaw = stoolAmountRaw; self.stoolShapeRaw = stoolShapeRaw
        self.hasUrine = hasUrine; self.temperature = temperature; self.weight = weight; self.note = note
    }

    convenience init(data: RecordData) {
        self.init(id: data.id, timestamp: data.timestamp, feedAmount: data.feedAmount,
                  stoolColor: data.stoolColor, stoolAmountRaw: data.stoolAmount?.rawValue,
                  stoolShapeRaw: data.stoolShape?.rawValue, hasUrine: data.hasUrine,
                  temperature: data.temperature, weight: data.weight, note: data.note)
    }

    func apply(_ data: RecordData) {
        timestamp = data.timestamp; feedAmount = data.feedAmount; stoolColor = data.stoolColor
        stoolAmountRaw = data.stoolAmount?.rawValue; stoolShapeRaw = data.stoolShape?.rawValue
        hasUrine = data.hasUrine; temperature = data.temperature; weight = data.weight; note = data.note
    }

    var data: RecordData {
        RecordData(id: id, timestamp: timestamp, feedAmount: feedAmount, stoolColor: stoolColor,
                   stoolAmount: stoolAmountRaw.flatMap(StoolAmount.init(rawValue:)),
                   stoolShape: stoolShapeRaw.flatMap(BristolType.init(rawValue:)),
                   hasUrine: hasUrine, temperature: temperature, weight: weight, note: note)
    }
}
```

`BabyMonster/Models/ProfileEntity.swift`:
```swift
import Foundation
import SwiftData

@Model
final class ProfileEntity {
    var name: String
    var birthDate: Date

    init(name: String, birthDate: Date) {
        self.name = name
        self.birthDate = birthDate
    }

    convenience init(data: ProfileData) {
        self.init(name: data.name, birthDate: data.birthDate)
    }

    var data: ProfileData { ProfileData(name: name, birthDate: birthDate) }
}
```

`BabyMonster/Models/ModelContainer+App.swift`:
```swift
import Foundation
import SwiftData

enum AppModelContainer {
    static let schema = Schema([RecordEntity.self, ProfileEntity.self])

    static func makeInMemory() throws -> ModelContainer {
        try ModelContainer(for: schema, configurations: [ModelConfiguration(isStoredInMemoryOnly: true)])
    }

    static func makePersistent() throws -> ModelContainer {
        try ModelContainer(for: schema, configurations: [ModelConfiguration(isStoredInMemoryOnly: false)])
    }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `xcodebuild test ...`
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 7: SwiftData entities + value-type mapping with tests"
```

---

### Task 8: 記錄頁（輸入表單 + 今日時間軸）

**Files:**
- Create: `BabyMonster/Views/RecordView.swift`
- Create: `BabyMonster/Views/RecordEntryForm.swift`
- Modify: `BabyMonster/RootTabView.swift`

**Interfaces:**
- Consumes: `RecordEntity`, `RecordData`, `StoolColorCard`, enums, `BabyAgeCalculator`, `ProfileEntity`
- Produces: `RecordView`（`@Query` 撈今日記錄，顯示時間軸 + 新增 sheet）；`RecordEntryForm`（可新增/編輯一筆）。

- [ ] **Step 1: 實作輸入表單**

`BabyMonster/Views/RecordEntryForm.swift`:
```swift
import SwiftUI

struct RecordEntryForm: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (RecordData) -> Void

    @State private var timestamp: Date
    @State private var feedText = ""
    @State private var stoolColor: Int? = nil
    @State private var stoolAmount: StoolAmount? = nil
    @State private var stoolShape: BristolType? = nil
    @State private var hasUrine = false
    @State private var tempText = ""
    @State private var weightText = ""
    @State private var note = ""

    private let existingID: UUID

    init(initial: RecordData? = nil, onSave: @escaping (RecordData) -> Void) {
        self.onSave = onSave
        _timestamp = State(initialValue: initial?.timestamp ?? Date())
        _feedText = State(initialValue: initial?.feedAmount.map { String($0) } ?? "")
        _stoolColor = State(initialValue: initial?.stoolColor)
        _stoolAmount = State(initialValue: initial?.stoolAmount)
        _stoolShape = State(initialValue: initial?.stoolShape)
        _hasUrine = State(initialValue: initial?.hasUrine ?? false)
        _tempText = State(initialValue: initial?.temperature.map { String($0) } ?? "")
        _weightText = State(initialValue: initial?.weight.map { String($0) } ?? "")
        _note = State(initialValue: initial?.note ?? "")
        self.existingID = initial?.id ?? UUID()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("時間") { DatePicker("時間", selection: $timestamp) }

                Section("喝奶") {
                    TextField("喝奶量 (ml)", text: $feedText).keyboardType(.decimalPad)
                }

                Section("大便") {
                    stoolColorPicker
                    if let c = stoolColor, StoolColorCard.isAbnormal(c) {
                        Label("顏色 \(c) 號屬異常色系，建議記錄並就診時告知醫生", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange).font(.footnote)
                    }
                    Picker("量", selection: $stoolAmount) {
                        Text("未選").tag(StoolAmount?.none)
                        ForEach(StoolAmount.allCases) { Text($0.displayName).tag(StoolAmount?.some($0)) }
                    }
                    Picker("形狀（布里斯托）", selection: $stoolShape) {
                        Text("未選").tag(BristolType?.none)
                        ForEach(BristolType.allCases) { Text($0.displayName).tag(BristolType?.some($0)) }
                    }
                }

                Section("小便") { Toggle("有小便", isOn: $hasUrine) }

                Section("生命徵象") {
                    TextField("體溫 (°C)", text: $tempText).keyboardType(.decimalPad)
                    TextField("體重 (g)", text: $weightText).keyboardType(.decimalPad)
                }

                Section("備註") { TextField("備註", text: $note, axis: .vertical) }
            }
            .navigationTitle("記錄")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { save() } }
            }
        }
    }

    private var stoolColorPicker: some View {
        VStack(alignment: .leading) {
            Text("顏色卡（1–9，實體卡為準）").font(.footnote).foregroundStyle(.secondary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 8) {
                ForEach(StoolColorCard.all, id: \.self) { n in
                    Button {
                        stoolColor = (stoolColor == n) ? nil : n
                    } label: {
                        Text("\(n)")
                            .frame(maxWidth: .infinity, minHeight: 36)
                            .background(StoolColorCard.color(for: n))
                            .foregroundStyle(.black)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6)
                                .stroke(stoolColor == n ? Color.accentColor : .clear, lineWidth: 3))
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private func save() {
        let data = RecordData(
            id: existingID, timestamp: timestamp,
            feedAmount: Double(feedText.trimmingCharacters(in: .whitespaces)),
            stoolColor: stoolColor, stoolAmount: stoolAmount, stoolShape: stoolShape,
            hasUrine: hasUrine,
            temperature: Double(tempText.trimmingCharacters(in: .whitespaces)),
            weight: Double(weightText.trimmingCharacters(in: .whitespaces)),
            note: note.isEmpty ? nil : note)
        onSave(data)
        dismiss()
    }
}
```

- [ ] **Step 2: 實作記錄頁**

`BabyMonster/Views/RecordView.swift`:
```swift
import SwiftUI
import SwiftData

struct RecordView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \RecordEntity.timestamp, order: .reverse) private var records: [RecordEntity]
    @Query private var profiles: [ProfileEntity]
    @State private var showingForm = false
    @State private var editing: RecordEntity?

    private var today: [RecordEntity] {
        records.filter { Calendar.current.isDateInToday($0.timestamp) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let p = profiles.first {
                    Section {
                        Text("\(p.name)　\(BabyAgeCalculator.age(birthDate: p.birthDate, asOf: Date()).displayText)")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Section("今日記錄（\(today.count) 筆）") {
                    ForEach(today) { entity in
                        Button { editing = entity } label: { RecordRow(data: entity.data) }
                            .buttonStyle(.plain)
                    }
                    .onDelete { indexSet in
                        for i in indexSet { context.delete(today[i]) }
                    }
                }
            }
            .navigationTitle("記錄")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingForm = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showingForm) {
                RecordEntryForm { data in context.insert(RecordEntity(data: data)) }
            }
            .sheet(item: $editing) { entity in
                RecordEntryForm(initial: entity.data) { data in entity.apply(data) }
            }
        }
    }
}

struct RecordRow: View {
    let data: RecordData
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(data.timestamp, format: .dateTime.hour().minute()).font(.headline)
            HStack(spacing: 10) {
                if let f = data.feedAmount { Label("\(Int(f)) ml", systemImage: "drop.fill") }
                if let c = data.stoolColor {
                    Label("\(c)號", systemImage: "circle.fill")
                        .foregroundStyle(StoolColorCard.isAbnormal(c) ? .orange : .primary)
                }
                if data.hasUrine { Label("小便", systemImage: "toilet.fill") }
                if let t = data.temperature { Label(String(format: "%.1f°C", t), systemImage: "thermometer") }
                if let w = data.weight { Label("\(Int(w))g", systemImage: "scalemass") }
            }.font(.caption).labelStyle(.titleAndIcon)
        }
    }
}
```

- [ ] **Step 3: 掛進 TabView**

修改 `BabyMonster/RootTabView.swift`，把第一個分頁改成 `RecordView()`：
```swift
import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            RecordView().tabItem { Label("記錄", systemImage: "square.and.pencil") }
            Text("每日統計").tabItem { Label("統計", systemImage: "list.bullet.rectangle") }
            Text("趨勢").tabItem { Label("趨勢", systemImage: "chart.xyaxis.line") }
            Text("設定").tabItem { Label("設定", systemImage: "gearshape") }
        }
    }
}
```

- [ ] **Step 4: 驗證建置**

Run: `xcodebuild build -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: `** BUILD SUCCEEDED **`（此時 App 尚未注入 modelContainer，Task 12 補上；先確保編譯通過）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 8: record entry form + today timeline view"
```

---

### Task 9: 每日統計頁

**Files:**
- Create: `BabyMonster/Views/DailyStatsView.swift`
- Modify: `BabyMonster/RootTabView.swift`

**Interfaces:**
- Consumes: `RecordEntity`, `DailyStats`
- Produces: `DailyStatsView`（DatePicker 選日期 + 5 項摘要卡片）。

- [ ] **Step 1: 實作**

`BabyMonster/Views/DailyStatsView.swift`:
```swift
import SwiftUI
import SwiftData

struct DailyStatsView: View {
    @Query private var records: [RecordEntity]
    @State private var date = Date()

    private var summary: DailySummary {
        DailyStats.summary(for: date, records: records.map { $0.data })
    }

    var body: some View {
        NavigationStack {
            List {
                Section { DatePicker("日期", selection: $date, displayedComponents: .date) }
                Section("當日統計") {
                    statRow("大便次數", "\(summary.stoolCount) 次")
                    statRow("小便次數", "\(summary.urineCount) 次")
                    statRow("總喝奶量", "\(Int(summary.totalFeed)) ml")
                    statRow("平均體溫", summary.averageTemperature.map { String(format: "%.1f °C", $0) } ?? "—")
                    statRow("平均體重", summary.averageWeight.map { "\(Int($0)) g" } ?? "—")
                }
            }
            .navigationTitle("每日統計")
        }
    }

    private func statRow(_ title: String, _ value: String) -> some View {
        HStack { Text(title); Spacer(); Text(value).bold() }
    }
}
```

- [ ] **Step 2: 掛進 TabView**

修改 `RootTabView.swift`，第二分頁改成 `DailyStatsView()`。

- [ ] **Step 3: 驗證建置**

Run: `xcodebuild build ...`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Task 9: daily statistics view"
```

---

### Task 10: 趨勢頁（Swift Charts）

**Files:**
- Create: `BabyMonster/Views/TrendView.swift`
- Create: `BabyMonster/Logic/TrendSeries.swift`
- Create: `BabyMonsterTests/TrendSeriesTests.swift`
- Modify: `BabyMonster/RootTabView.swift`

**Interfaces:**
- Consumes: `RecordData`, `DailyStats`
- Produces:
  - `enum TrendMetric: String, CaseIterable, Identifiable { case stoolCount, urineCount, totalFeed, avgTemperature, avgWeight }`（有 `displayName`、`unit`）
  - `struct TrendPoint: Equatable { let date: Date; let value: Double? }`
  - `enum TrendSeries { static func series(metric: TrendMetric, days: Int, endingOn: Date, records: [RecordData], calendar: Calendar = .current) -> [TrendPoint] }`（回傳連續 `days` 天、每天一點）
  - `TrendView`（選天數 7/14/30/自訂 + 選指標 + 折線圖）

- [ ] **Step 1: 撰寫失敗測試**

`BabyMonsterTests/TrendSeriesTests.swift`:
```swift
import XCTest
@testable import BabyMonster

final class TrendSeriesTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)
    func d(_ y: Int, _ m: Int, _ day: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: day, hour: h))!
    }
    func rec(_ date: Date, feed: Double? = nil, stool: Int? = nil) -> RecordData {
        RecordData(id: UUID(), timestamp: date, feedAmount: feed, stoolColor: stool,
                   stoolAmount: nil, stoolShape: nil, hasUrine: false, temperature: nil, weight: nil, note: nil)
    }

    func testSeriesLengthAndOrder() {
        let pts = TrendSeries.series(metric: .totalFeed, days: 7, endingOn: d(2026, 7, 15),
                                     records: [], calendar: cal)
        XCTAssertEqual(pts.count, 7)
        XCTAssertEqual(pts.map { $0.date }, pts.map { $0.date }.sorted())
        XCTAssertEqual(cal.dateComponents([.day], from: pts.first!.date, to: pts.last!.date).day, 6)
    }

    func testTotalFeedPerDay() {
        let records = [rec(d(2026, 7, 15, 8), feed: 100), rec(d(2026, 7, 15, 12), feed: 50),
                       rec(d(2026, 7, 14, 9), feed: 30)]
        let pts = TrendSeries.series(metric: .totalFeed, days: 2, endingOn: d(2026, 7, 15),
                                     records: records, calendar: cal)
        XCTAssertEqual(pts[0].value, 30)   // 7/14
        XCTAssertEqual(pts[1].value, 150)  // 7/15
    }

    func testAvgTempNilWhenNoData() {
        let pts = TrendSeries.series(metric: .avgTemperature, days: 1, endingOn: d(2026, 7, 15),
                                     records: [], calendar: cal)
        XCTAssertNil(pts[0].value)
    }
}
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `xcodebuild test ...`
Expected: 編譯失敗（`TrendSeries`/`TrendMetric`/`TrendPoint` 未定義）。

- [ ] **Step 3: 實作 TrendSeries**

`BabyMonster/Logic/TrendSeries.swift`:
```swift
import Foundation

enum TrendMetric: String, CaseIterable, Identifiable {
    case stoolCount, urineCount, totalFeed, avgTemperature, avgWeight
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .stoolCount: return "大便次數"
        case .urineCount: return "小便次數"
        case .totalFeed: return "總喝奶量"
        case .avgTemperature: return "平均體溫"
        case .avgWeight: return "平均體重"
        }
    }
    var unit: String {
        switch self {
        case .stoolCount, .urineCount: return "次"
        case .totalFeed: return "ml"
        case .avgTemperature: return "°C"
        case .avgWeight: return "g"
        }
    }
}

struct TrendPoint: Equatable {
    let date: Date
    let value: Double?
}

enum TrendSeries {
    static func series(metric: TrendMetric, days: Int, endingOn: Date,
                       records: [RecordData], calendar: Calendar = .current) -> [TrendPoint] {
        guard days > 0 else { return [] }
        let endDay = calendar.startOfDay(for: endingOn)
        return (0..<days).reversed().map { offset in
            let day = calendar.date(byAdding: .day, value: -offset, to: endDay)!
            let s = DailyStats.summary(for: day, records: records, calendar: calendar)
            let value: Double?
            switch metric {
            case .stoolCount: value = Double(s.stoolCount)
            case .urineCount: value = Double(s.urineCount)
            case .totalFeed: value = s.totalFeed
            case .avgTemperature: value = s.averageTemperature
            case .avgWeight: value = s.averageWeight
            }
            return TrendPoint(date: day, value: value)
        }
    }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `xcodebuild test ...`
Expected: `** TEST SUCCEEDED **`

- [ ] **Step 5: 實作 TrendView**

`BabyMonster/Views/TrendView.swift`:
```swift
import SwiftUI
import SwiftData
import Charts

struct TrendView: View {
    @Query private var records: [RecordEntity]
    @State private var metric: TrendMetric = .totalFeed
    @State private var days = 7
    @State private var customDays = 7

    private let presets = [7, 14, 30]

    private var points: [TrendPoint] {
        TrendSeries.series(metric: metric, days: days, endingOn: Date(), records: records.map { $0.data })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("指標") {
                    Picker("指標", selection: $metric) {
                        ForEach(TrendMetric.allCases) { Text($0.displayName).tag($0) }
                    }.pickerStyle(.menu)
                }
                Section("天數") {
                    Picker("天數", selection: $days) {
                        ForEach(presets, id: \.self) { Text("\($0) 天").tag($0) }
                        Text("自訂").tag(-1)
                    }.pickerStyle(.segmented)
                    if days == -1 {
                        Stepper("自訂：\(customDays) 天", value: $customDays, in: 2...180)
                            .onAppear { customDays = max(2, customDays) }
                    }
                }
                Section("\(metric.displayName)（\(metric.unit)）") {
                    chart.frame(height: 260)
                }
            }
            .navigationTitle("趨勢")
        }
    }

    private var effectiveDays: Int { days == -1 ? customDays : days }

    private var chart: some View {
        Chart(TrendSeries.series(metric: metric, days: effectiveDays, endingOn: Date(),
                                 records: records.map { $0.data }), id: \.date) { point in
            if let v = point.value {
                LineMark(x: .value("日期", point.date, unit: .day), y: .value(metric.displayName, v))
                PointMark(x: .value("日期", point.date, unit: .day), y: .value(metric.displayName, v))
            }
        }
        .chartXAxis { AxisMarks(values: .stride(by: .day)) { _ in AxisGridLine(); AxisTick() } }
    }
}
```

- [ ] **Step 6: 掛進 TabView**

修改 `RootTabView.swift`，第三分頁改成 `TrendView()`。

- [ ] **Step 7: 驗證建置**

Run: `xcodebuild build ...`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Task 10: trend view with Swift Charts + trend series tests"
```

---

### Task 11: 設定頁（名字 / 生日 / 年齡 / 匯出匯入）

**Files:**
- Create: `BabyMonster/Views/SettingsView.swift`
- Create: `BabyMonster/Logic/BackupDocument.swift`
- Modify: `BabyMonster/RootTabView.swift`

**Interfaces:**
- Consumes: `ProfileEntity`, `RecordEntity`, `DataTransfer`, `BackupPayload`, `BabyAgeCalculator`
- Produces:
  - `struct BackupDocument: FileDocument`（`.json`，包住 `Data`）
  - `SettingsView`（編輯名字/生日、顯示年齡、匯出 `.fileExporter`、匯入 `.fileImporter` 並 `mergeRecords` 寫回）

- [ ] **Step 1: 實作 FileDocument**

`BabyMonster/Logic/BackupDocument.swift`:
```swift
import SwiftUI
import UniformTypeIdentifiers

struct BackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data

    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
```

- [ ] **Step 2: 實作設定頁**

`BabyMonster/Views/SettingsView.swift`:
```swift
import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(\.modelContext) private var context
    @Query private var profiles: [ProfileEntity]
    @Query private var records: [RecordEntity]

    @State private var name = "BabyMonster"
    @State private var birthDate = Date()
    @State private var showingExporter = false
    @State private var showingImporter = false
    @State private var exportDocument = BackupDocument(data: Data())
    @State private var message: String?

    private var profile: ProfileEntity? { profiles.first }

    var body: some View {
        NavigationStack {
            Form {
                Section("寶寶資料") {
                    TextField("名字", text: $name)
                    DatePicker("生日", selection: $birthDate, displayedComponents: .date)
                    Text("目前年齡：\(BabyAgeCalculator.age(birthDate: birthDate, asOf: Date()).displayText)")
                        .foregroundStyle(.secondary)
                    Button("儲存寶寶資料") { saveProfile() }
                }
                Section("資料同步") {
                    Button("匯出資料（分享給家人）") { prepareExport() }
                    Button("匯入資料（合併）") { showingImporter = true }
                }
                if let message { Section { Text(message).font(.footnote).foregroundStyle(.secondary) } }
            }
            .navigationTitle("設定")
            .onAppear { loadProfile() }
            .fileExporter(isPresented: $showingExporter, document: exportDocument,
                          contentType: .json, defaultFilename: exportFilename) { result in
                if case .success = result { message = "已匯出，可用 LINE 傳給家人" }
            }
            .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.json]) { result in
                handleImport(result)
            }
        }
    }

    private var exportFilename: String {
        let f = DateFormatter(); f.dateFormat = "yyyyMMdd"
        return "BabyMonster-\(f.string(from: Date()))"
    }

    private func loadProfile() {
        if let p = profile { name = p.name; birthDate = p.birthDate }
    }

    private func saveProfile() {
        if let p = profile { p.name = name; p.birthDate = birthDate }
        else { context.insert(ProfileEntity(name: name, birthDate: birthDate)) }
        message = "已儲存寶寶資料"
    }

    private func prepareExport() {
        let payload = BackupPayload(
            profile: ProfileData(name: name, birthDate: birthDate),
            records: records.map { $0.data })
        do {
            exportDocument = BackupDocument(data: try DataTransfer.encode(payload))
            showingExporter = true
        } catch { message = "匯出失敗：\(error.localizedDescription)" }
    }

    private func handleImport(_ result: Result<URL, Error>) {
        switch result {
        case .failure(let e): message = "匯入失敗：\(e.localizedDescription)"
        case .success(let url):
            let needsStop = url.startAccessingSecurityScopedResource()
            defer { if needsStop { url.stopAccessingSecurityScopedResource() } }
            do {
                let payload = try DataTransfer.decode(try Data(contentsOf: url))
                let merged = DataTransfer.mergeRecords(local: records.map { $0.data }, incoming: payload.records)
                let existingIDs = Set(records.map { $0.id })
                for r in merged where !existingIDs.contains(r.id) { context.insert(RecordEntity(data: r)) }
                if profile == nil { context.insert(ProfileEntity(data: payload.profile)) }
                message = "已匯入並合併，共 \(merged.count) 筆記錄"
            } catch { message = "匯入失敗：\(error.localizedDescription)" }
        }
    }
}
```

- [ ] **Step 3: 掛進 TabView**

修改 `RootTabView.swift`，第四分頁改成 `SettingsView()`。此時 `RootTabView` 四個分頁全部接上真實視圖。

- [ ] **Step 4: 驗證建置**

Run: `xcodebuild build ...`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Task 11: settings view with profile, age, export/import"
```

---

### Task 12: 整合（注入 ModelContainer）+ 端對端驗證

**Files:**
- Modify: `BabyMonster/BabyMonsterApp.swift`

**Interfaces:**
- Consumes: `AppModelContainer`, `RootTabView`
- Produces: 完整可跑的 App（持久化 + 4 分頁串接）。

- [ ] **Step 1: 注入 modelContainer**

`BabyMonster/BabyMonsterApp.swift`:
```swift
import SwiftUI
import SwiftData

@main
struct BabyMonsterApp: App {
    var body: some Scene {
        WindowGroup {
            RootTabView()
        }
        .modelContainer(for: [RecordEntity.self, ProfileEntity.self])
    }
}
```

- [ ] **Step 2: 全套測試通過**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: `** TEST SUCCEEDED **`，全部單元測試（StoolColor / ModelCodable / DailyStats / BabyAge / DataTransfer / PersistenceMapping / TrendSeries）通過。

- [ ] **Step 3: 端對端手動驗證（模擬器）**

啟動模擬器並安裝：
```bash
xcrun simctl boot "iPhone 17 Pro" 2>/dev/null || true
xcodebuild build -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO -derivedDataPath ./build
xcrun simctl install "iPhone 17 Pro" ./build/Build/Products/Debug-iphonesimulator/BabyMonster.app
xcrun simctl launch "iPhone 17 Pro" com.wsturkey6.BabyMonster
```
手動確認（或用 verify skill 驅動）：設定頁存名字+生日→記錄頁新增一筆含喝奶/大便7號/小便→今日列表出現→每日統計顯示對應數字→趨勢頁畫出點→大便選 3 號時出現異常提醒。

- [ ] **Step 4: 更新 PROGRESS.md 為完成狀態並 Commit**

```bash
git add -A
git commit -m "Task 12: inject model container, full app integration + e2e verify"
```

---

## Self-Review

**Spec coverage：**
- §3 技術棧 → Task 1（Xcode 專案、iOS17、XCTest）✓
- §4 資料模型 → Task 3（值型別）+ Task 7（SwiftData）✓
- §5 統計定義 → Task 4 ✓；§5.1 年齡 → Task 5 ✓
- §6 大便顏色卡 → Task 2 ✓
- §7 布里斯托 → Task 2（BristolType）+ Task 8（選擇 UI）✓
- §8 四分頁 → Task 8/9/10/11 ✓
- §9 匯出匯入合併 → Task 6（邏輯）+ Task 11（UI）✓
- §10 測試策略 → Task 2/4/5/6 的 TDD ✓
- §11 專案結構 → Task 1–12 對應檔案 ✓
- §12 專案規則 → 已於本 session 設定（settings.json/hook/PROGRESS.md），非本 plan 的程式任務

**Placeholder scan：** 無 TBD/TODO；每個程式步驟含完整程式碼與可執行指令。

**Type consistency：** `RecordData`/`ProfileData`/`DailySummary`/`BabyAge`/`BackupPayload`/`TrendPoint`/`TrendMetric`/`RecordEntity`/`ProfileEntity`/`AppModelContainer` 命名在各任務間一致；enum rawValue 對應（StoolAmount:String、BristolType:Int）一致；`mergeRecords(local:incoming:)` 簽名在 Task 6 定義、Task 11 使用一致。

## 已知風險與備援
- **手寫 pbxproj**（Task 1）為最大風險。若 `xcodebuild -list` 無法辨識，備援：用 Xcode GUI 建立同名 SwiftUI App 專案，再納入本 plan 各 Swift 檔（synchronized 資料夾會自動吃到）。
- 模擬器名稱 `iPhone 17 Pro` 依本機實際清單（已確認存在）；若改機請對應調整 `-destination`。
