import { describe, it, expect } from "vitest";
import { maskEmail } from "@shared/maskEmail";

describe("maskEmail", () => {
  it("keeps 2 chars of the local part and of the first domain label", () => {
    expect(maskEmail("regina.lasmar@ephar.com.br")).toBe("re•••••@ep•••.com.br");
    expect(maskEmail("joao@empresa.com")).toBe("jo•••••@em•••.com");
  });

  it("keeps 1 char when the local part has 2 or fewer chars", () => {
    expect(maskEmail("ab@gmail.com")).toBe("a•••••@gm•••.com");
    expect(maskEmail("a@gmail.com")).toBe("a•••••@gm•••.com");
  });

  it("uses a fixed mask length so the real length is not leaked", () => {
    expect(maskEmail("abc@x.com").length).toBe(maskEmail("abcdefghijklmnop@x.com").length);
    expect(maskEmail("abc@longdomainname.com")).toBe("ab•••••@lo•••.com");
  });

  it("handles a one-char first domain label", () => {
    expect(maskEmail("abc@x.com")).toBe("ab•••••@x•••.com");
  });

  it("handles a domain with a single label", () => {
    expect(maskEmail("abc@localhost")).toBe("ab•••••@lo•••");
  });

  it("never returns the full address", () => {
    const masked = maskEmail("regina.lasmar@ephar.com.br");
    expect(masked).not.toContain("regina.lasmar");
    expect(masked).not.toContain("ephar");
  });

  it("returns a fully masked placeholder for input without a valid @", () => {
    expect(maskEmail("not-an-email")).toBe("•••••");
    expect(maskEmail("@x.com")).toBe("•••••");
  });
});
