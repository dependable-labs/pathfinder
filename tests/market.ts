import { TestFixture } from "./utils";
import { testInitializeController } from "./admin-actions/initialize-controller";
import { testCreateCollateral } from "./admin-actions/create-collateral";
import { ControllerFixture } from "./fixtures/controller";
import { CollateralFixture } from "./fixtures/collateral";

describe("Collateral", () => {
  let fixture: TestFixture;
  let controller: ControllerFixture;
  let collateral: CollateralFixture;

  before(async () => {
    fixture = await TestFixture.setup();
  });

  it("should initialize controller", async () => {
    controller = await testInitializeController(
      fixture.program,
      fixture.provider,
      fixture.authority.publicKey
    );
  });

  it("should create a collateral", async () => {
    collateral = await testCreateCollateral(fixture, controller);
  });

  // Add more test cases as needed
});