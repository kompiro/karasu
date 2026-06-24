import { expect, test } from "../fixtures/opfs.js";
import { replaceEditorContent } from "../fixtures/editor.js";

/**
 * AT-1738: deploy view job lane (first kind band).
 *
 * Job-only deploy containers are pulled out of the dependency DAG and clustered
 * into a dedicated job band, rendered below the compute/store DAG and above the
 * unclassified row. The layout math is covered by `deploy-layout.test.ts`; this
 * spec asserts the observable vertical placement in the app via `boundingBox`
 * (same approach as `at-0049-*`).
 *
 * Out of scope:
 *  - Exact pixel geometry / band caption styling — manual visual review.
 */

const JOB_BAND_KRS = `system EC {
  service Api { label "API" }
  service Feedback { label "Feedback" }
}

deploy "Production" {
  oci apiServer {
    runtime "Node.js 20"
    realizes Api
  }
  job weeklyFeedback {
    schedule "0 0 * * 1"
    realizes Feedback
  }
  job dailyDigest {
    schedule "0 3 * * *"
    realizes Feedback
  }
  oci looseUnit {
    runtime "Node.js 20"
  }
}
`;

test.describe("AT-1738 Deploy view job lane", () => {
  test("job band renders below compute and above the unclassified row", async ({ page, opfs }) => {
    await opfs.seed({ mode: "memory" });
    await opfs.gotoApp();
    await replaceEditorContent(page, JOB_BAND_KRS);

    await page.getByRole("tab", { name: "Deploy" }).click();
    await expect(page.getByRole("tab", { name: "Deploy", selected: true })).toBeVisible();

    // The job band wrapper is marked with data-kind-band="job".
    const jobBand = page.locator('[data-kind-band="job"][data-container-id="__job_band__"]');
    await expect(jobBand).toHaveCount(1);

    // Reference rows: the compute container (DAG) and the unclassified row.
    const compute = page.locator('[data-container-id="Api"]');
    const unclassified = page.locator('[data-container-id="__unclassified__"]');
    await expect(compute).toHaveCount(1);
    await expect(unclassified).toHaveCount(1);

    const computeBox = await compute.boundingBox();
    const bandBox = await jobBand.boundingBox();
    const unclassifiedBox = await unclassified.boundingBox();
    if (!computeBox || !bandBox || !unclassifiedBox) {
      throw new Error("bounding box missing");
    }

    // Band sits below the compute DAG and above the unclassified row.
    expect(bandBox.y).toBeGreaterThan(computeBox.y);
    expect(unclassifiedBox.y).toBeGreaterThan(bandBox.y);

    // Both job containers live inside the band's vertical extent.
    const feedback = page.locator('[data-container-id="Feedback"][data-kind-band="job"]');
    await expect(feedback).toHaveCount(1);
    const feedbackBox = await feedback.boundingBox();
    if (!feedbackBox) throw new Error("feedback bounding box missing");
    expect(feedbackBox.y).toBeGreaterThanOrEqual(bandBox.y - 1);
    expect(feedbackBox.y + feedbackBox.height).toBeLessThanOrEqual(bandBox.y + bandBox.height + 1);
  });
});
